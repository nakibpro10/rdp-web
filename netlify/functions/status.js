const { Octokit } = require("@octokit/rest");

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
            
            // ১. সকল জব খুঁজে বের করা (সাধারণত একটিই থাকে)
            const jobsResponse = await octokit.actions.listJobsForWorkflowRun({
                owner: OWNER,
                repo: REPO,
                run_id: run_id
            });
            
            const job_id = jobsResponse.data.jobs[0].id;

            // ২. জবের লগ ডাউনলোড করা (ZIP ফাইল হিসেবে আসে, কিন্তু এটি শুধুমাত্র টেক্সট লগ)
            // আমরা Log URL ডাউনলোড করে নিচ্ছি
            const logUrlResponse = await octokit.actions.downloadJobLogsForWorkflowRun({
                owner: OWNER,
                repo: REPO,
                job_id: job_id,
            });
            
            // লগ ডাউনলোড URL টি একটি রিডাইরেক্ট URL দেবে, তাই আমরা সরাসরি fetch ব্যবহার করব
            const logZipUrl = logUrlResponse.url;

            // ৩. লগ ফাইল (ZIP) ডাউনলোড করা এবং Unzip না করে টেক্সট হিসেবে পড়া 
            // *বিঃদ্রঃ:* যেহেতু GitHub Logs API একটি ZIP ফাইল দেয়, তাই এটি ডাউনলোড করার জন্য আমরা সরাসরি fetch ব্যবহার করছি।
            const logDownload = await fetch(logZipUrl);
            const logZipBuffer = await logDownload.buffer();

            // এখানে আমরা AdmZip ব্যবহার করছি, কিন্তু Artifact Extraction এর চেয়ে Log Extraction অনেক হালকা
            const AdmZip = require("adm-zip");
            const zip = new AdmZip(logZipBuffer);
            
            // একটি জবের লগ সাধারণত একটিই ফাইল হয়
            const logEntry = zip.getEntries()[0]; 
            const logText = logEntry.getData().toString('utf8');

            // ৪. লগ টেক্সট থেকে ক্রেডেনশিয়াল খুঁজে বের করা (Scrapping)
            
            const ipMatch = logText.match(/Address\s*:\s*(\S+)/);
            const userMatch = logText.match(/Username\s*:\s*(\S+)/); 
            const passMatch = logText.match(/Password\s*:\s*User:\s*RDP\s*\|\s*Password\s*:\s*(\S+)/);
            
            if (ipMatch && userMatch && passMatch) {
                const creds = {
                    ip: ipMatch[1],
                    user: userMatch[1],
                    pass: passMatch[1]
                };
                
                return { statusCode: 200, body: JSON.stringify({ status: 'ready', data: creds }) };
            } else {
                return { statusCode: 500, body: JSON.stringify({ status: 'failed', error: 'Credentials not found in logs.' }) };
            }

        } else if (run.data.conclusion === 'failure') {
            return { statusCode: 200, body: JSON.stringify({ status: 'failed', message: 'Workflow failed on GitHub.' }) };
        } 
        
        return { statusCode: 200, body: JSON.stringify({ status: 'processing' }) };

    } catch (error) {
        // মারাত্মক API বা প্রক্রিয়াকরণ ত্রুটি
        return {
            statusCode: 500,
            body: JSON.stringify({ status: 'failed', error: `Critical error during log scraping: ${error.message}` })
        };
    }
};
