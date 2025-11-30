const { Octokit } = require("@octokit/rest");
const AdmZip = require("adm-zip");
// Node.js এর Fetch API ব্যবহার করার জন্য
const fetch = require("node-fetch"); 

exports.handler = async (event, context) => {
    // URL থেকে run_id বের করা
    const { run_id } = event.queryStringParameters;
    
    if (!run_id) {
        return { statusCode: 400, body: JSON.stringify({ error: "Missing run_id" }) };
    }

    // GitHub PAT ব্যবহার করে Octokit initialize
    const octokit = new Octokit({ auth: process.env.GITHUB_PAT });
    const OWNER = 'nakibpro10';
    const REPO = 'freeRDP';

    try {
        // ১. Workflow রানের স্ট্যাটাস চেক করা
        const run = await octokit.actions.getWorkflowRun({
            owner: OWNER,
            repo: REPO,
            run_id: run_id
        });

        // যদি Workflow সফলভাবে শেষ হয়
        if (run.data.status === 'completed' && run.data.conclusion === 'success') {
            
            // ২. Artifact লিস্ট করা
            const artifacts = await octokit.actions.listWorkflowRunArtifacts({
                owner: OWNER,
                repo: REPO,
                run_id: run_id
            });

            const match = artifacts.data.artifacts.find(a => a.name === 'rdp-creds');
            
            if (match) {
                // ৩. Artifact ডাউনলোড করা (জিপ ফাইল হিসেবে)
                // Authentication হেডার সহ ডাউনলোড করা হয়
                const downloadResponse = await octokit.actions.downloadArtifact({
                    owner: OWNER,
                    repo: REPO,
                    artifact_id: match.id,
                    archive_format: 'zip'
                });
                
                // Response Data Bufffer এ রূপান্তর
                const zipBuffer = Buffer.from(downloadResponse.data);

                // ৪. জিপ ফাইল থেকে JSON ডেটা বের করা
                const zip = new AdmZip(zipBuffer);
                const zipEntries = zip.getEntries();
                
                // প্রথম ফাইলটিই আমাদের JSON ফাইল (creds.json)
                const credsText = zipEntries.find(entry => entry.entryName === 'creds.json').getData().toString('utf8');
                const creds = JSON.parse(credsText);

                // সফলভাবে ডেটা পাওয়া গেছে
                return {
                    statusCode: 200,
                    body: JSON.stringify({ status: 'ready', data: creds })
                };
            }
        } else if (run.data.conclusion === 'failure') {
            // যদি ফেইল করে
            return { statusCode: 200, body: JSON.stringify({ status: 'failed', message: 'Workflow failed on GitHub.' }) };
        } 
        
        // যদি এখনও চলছে বা artifact পাওয়া যায়নি
        return { statusCode: 200, body: JSON.stringify({ status: 'processing' }) };

    } catch (error) {
        // কোনো API বা আনজিপিং এ ত্রুটি হলে
        console.error("Status Function Error:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: "Failed to retrieve credentials. Check Netlify logs for details." })
        };
    }
};
