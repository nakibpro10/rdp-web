const { Octokit } = require("@octokit/rest");

exports.handler = async (event, context) => {
    // Netlify এর জন্য: GITHUB_PAT এনভায়রনমেন্ট ভেরিয়েবল থেকে নেওয়া হচ্ছে
    const octokit = new Octokit({ auth: process.env.GITHUB_PAT });
    
    // আপনার রিপোজিটরির তথ্য (আপনি যেমনটি দিয়েছিলেন)
    const OWNER = 'nakibpro10';
    const REPO = 'freeRDP';

    try {
        // Workflow Dispatch ট্রিগার করা
        await octokit.actions.createWorkflowDispatch({
            owner: OWNER,
            repo: REPO,
            workflow_id: 'main.yml',
            ref: 'main'
        });

        // GitHub API কে সময় দেওয়া (৩ সেকেন্ড অপেক্ষা)
        await new Promise(r => setTimeout(r, 3000));

        // সাম্প্রতিক Workflow রান আইডি খুঁজে বের করা
        const runs = await octokit.actions.listWorkflowRuns({
            owner: OWNER,
            repo: REPO,
            workflow_id: 'main.yml',
            per_page: 1
        });
        
        // সফল রেসপন্স (Netlify স্টাইল)
        return {
            statusCode: 200,
            body: JSON.stringify({ 
                success: true, 
                run_id: runs.data.workflow_runs[0].id 
            })
        };

    } catch (error) {
        // ব্যর্থ রেসপন্স (Netlify স্টাইল)
        return {
            statusCode: 500,
            body: JSON.stringify({ 
                success: false, 
                message: error.message || "Failed to trigger GitHub workflow." 
            })
        };
    }
};