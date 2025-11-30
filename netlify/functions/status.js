const { Octokit } = require("@octokit/rest");
const AdmZip = require("adm-zip");
const fetch = require("node-fetch"); 

exports.handler = async (event, context) => {
    const { run_id } = event.queryStringParameters;
    const octokit = new Octokit({ auth: process.env.GITHUB_PAT });
    const OWNER = 'nakibpro10';
    const REPO = 'freeRDP';

    try {
        const run = await octokit.actions.getWorkflowRun({
            owner: OWNER,
            repo: REPO,
            run_id: run_id
        });

        if (run.data.status === 'completed' && run.data.conclusion === 'success') {
            
            // ১. Job ID খুঁজে বের করা
            const jobsResponse = await octokit.actions.listJobsForWorkflowRun({
                owner: OWNER,
                repo: REPO,
                run_id: run_id
            });
            
            if (!jobsResponse.data.jobs || jobsResponse.data.jobs.length === 0) {
                 return { statusCode: 500, body: JSON.stringify({ status: 'failed', error: 'No jobs found for this run.' }) };
            }
            
            const job_id = jobsResponse.data.jobs[0].id;

            // ২. জবের লগ ডাউনলোড URL সংগ্রহ করা
            const logUrlResponse = await octokit.actions.downloadJobLogsForWorkflowRun({
                owner: OWNER,
                repo: REPO,
                job_id: job_id,
            });
            
            const logZipUrl = logUrlResponse.url;

            // ৩. লগ ফাইল (ZIP) ডাউনলোড করা
            const logDownload = await fetch(logZipUrl);
            const logZipBuffer = await logDownload.buffer();

            // ৪. ZIP ফাইল থেকে লগ টেক্সট বের করা
            const zip = new AdmZip(logZipBuffer);
            const logEntry = zip.getEntries()[0]; 
            const logText = logEntry.getData().toString('utf8');

            // ৫. লগ টেক্সট থেকে ক্রেডেনশিয়াল খুঁজে বের করা (Scrapping)
            // (Regex: খেয়াল রাখুন, আপনার লগে "Password: User: RDP | Password: [Generated Password]" এই ফরম্যাট আছে)
            const ipMatch = logText.match(/Address\s*:\s*(\S+)/);
            const userMatch = logText.match(/Username\s*:\s*(\S+)/); 
            const passMatch = logText.match(/Password\s*:\s*User:\s*RDP\s*\|\s*Password\s*:\s*(\S+)/); // এটি আপনার কোড অনুযায়ী আপডেট করা হয়েছে
            
            if (ipMatch && userMatch && passMatch) {
                // ক্রেডেনশিয়াল খুঁজে পাওয়া গেছে
                const creds = {
                    ip: ipMatch[1],
                    user: userMatch[1],
                    pass: passMatch[1]
                };
                return { statusCode: 200, body: JSON.stringify({ status: 'ready', data: creds }) };
            } else {
                // ক্রেডেনশিয়াল খুঁজে পাওয়া যায়নি - DEBUG MODE!
                // আমরা পুরো লগ টেক্সটটি ফেরত পাঠাচ্ছি যাতে আপনি এটি দেখতে পারেন
                console.error("[DEBUG FAIL] Credentials not found. Returning raw log for analysis.");
                
                return {
                    statusCode: 200,
                    body: JSON.stringify({ 
                        status: 'failed', 
                        message: 'Regex Failed. Need Log Analysis.',
                        // এখানে মূল লগ টেক্সট পাঠানো হচ্ছে, আপনি এটি কপি করে দেবেন
                        debug_log: logText 
                    })
                };
            }

        } else if (run.data.conclusion === 'failure') {
            return { statusCode: 200, body: JSON.stringify({ status: 'failed', message: 'Workflow failed on GitHub.' }) };
        } 
        
        return { statusCode: 200, body: JSON.stringify({ status: 'processing' }) };

    } catch (error) {
        // মারাত্মক API বা প্রক্রিয়াকরণ ত্রুটি
        return {
            statusCode: 500,
            body: JSON.stringify({ status: 'failed', error: `Critical error: ${error.message}` })
        };
    }
};
