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

        if (run.data.status === 'completed' && run.data.conclusion === 'success') {
            // ২. Artifact লিস্ট করা
            const artifacts = await octokit.actions.listWorkflowRunArtifacts({
                owner: OWNER,
                repo: REPO,
                run_id: run_id
            });

            const match = artifacts.data.artifacts.find(a => a.name === 'rdp-creds');
            
            if (match) {
                // ৩. Artifact ডাউনলোড করা (জিপ ফাইল)
                const download = await octokit.actions.downloadArtifact({
                    owner: OWNER,
                    repo: REPO,
                    artifact_id: match.id,
                    archive_format: 'zip'
                });

                // ৪. জিপ ফাইল থেকে JSON ডেটা বের করা
                const zip = new AdmZip(Buffer.from(download.data));
                const zipEntries = zip.getEntries();
                const credsText = zipEntries[0].getData().toString('utf8');
                const creds = JSON.parse(credsText);

                // সফলভাবে ডেটা পাওয়া গেছে
                return {
                    statusCode: 200,
                    body: JSON.stringify({ status: 'ready', data: creds })
                };
            }
        } else if (run.data.conclusion === 'failure') {
            return { statusCode: 200, body: JSON.stringify({ status: 'failed' }) };
        } 
        
        // এখনও চলছে
        return { statusCode: 200, body: JSON.stringify({ status: 'processing' }) };

    } catch (error) {
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message })
        };
    }
};