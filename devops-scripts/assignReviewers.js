module.exports = async ({ github, context, processEnv }) => {
    const prNumber = context.payload.pull_request.number;
    const { owner, repo } = context.repo;
    const { DEVELOPERS, TEAMLEADS, ACTION_NAME, CHECK_RESULT } = processEnv;

    const prDetails = await github.rest.pulls.get({
        owner,
        repo,
        pull_number: prNumber
    });

    const requestedReviewers = prDetails.data.requested_reviewers;
    const requestedReviewersNames = requestedReviewers.map(user => user.login);
    const prAuthor = prDetails.data.user.login;
    const latestCommitSha = prDetails.data.head.sha;  // Get the latest commit SHA

    const developers = DEVELOPERS.split("\n").reduce((acc, pair) => {
        const [devs, lead] = pair.split("=");

        if (lead) {
            devs.split(",").forEach(dev => {
                acc[dev.trim()] = lead.trim();
            });
        }
        return acc;
    }, {});

    const teamleads = TEAMLEADS.split("\n").reduce((acc, pair) => {
        const [teamlead, techarch] = pair.split("=");
        acc[teamlead.trim()] = techarch ? techarch.trim() : null;
        return acc;
    }, {});

    const lead = developers[prAuthor];

    if (!lead) {
        console.log(`No Team Lead found for PR author: ${prAuthor}`);
        return;
    }

    // Get all reviews for the PR
    const { data: reviews } = await github.rest.pulls.listReviews({
        owner,
        repo,
        pull_number: prNumber
    });

    // Filter reviews by the latest commit
    const latestReviews = reviews
        .filter(review => review.commit_id === latestCommitSha)  // Only consider latest commit reviews
        .reduce((acc, review) => {
            acc[review.user.login] = review;
            return acc;
        }, {});

    const prReviewers = [];

    // Add Team Lead as a reviewer on success validation or ready_for_review event
    if (CHECK_RESULT === "success" && !requestedReviewersNames.includes(lead)) {
        prReviewers.push(lead);
    }

    // Add Team Lead as a reviewer on ready_for_review event
    if (ACTION_NAME === "ready_for_review" && !requestedReviewersNames.includes(lead)) {
        const requiredCheckName = "Merge Queue / Merge status";
        const { data: checks } = await github.rest.checks.listForRef({
            owner: context.repo.owner,
            repo: context.repo.repo,
            ref: latestCommitSha
        });
        const requiredCheck = checks.check_runs.find(check => check.name === requiredCheckName);

        if (requiredCheck && requiredCheck.conclusion === "success") {
            prReviewers.push(lead);
            console.log(`Team Lead is ${lead}`);
        } else {
            console.log(`Merge status not success`);
        }
    }

    // Add Tech Arch as a reviewer on submit event **only if the last commit is already approved by TL**
    const techArch = teamleads[lead];
    if (ACTION_NAME === "submitted" && techArch && !requestedReviewersNames.includes(techArch)) {
        const latestTLReview = latestReviews[lead];
        const latestTAReview = latestReviews[techArch];

        const isTLApproved = latestTLReview && latestTLReview.state === "APPROVED";
        const isTAApproved = latestTAReview && latestTAReview.state === "APPROVED";

        if (isTLApproved && isTAApproved) {
            console.log(`Team Lead (${lead}) and Tech Arch (${techArch}) approved the latest commit`);
        } else if (isTLApproved) {
            prReviewers.push(techArch);
            console.log(`Tech Arch is ${techArch}`);
        } else {
            console.log(`Team Lead ${lead} has not approved the latest commit.Tech Arch not assigned.`);
        }
    }

    if (prReviewers.length > 0) {
        await github.rest.pulls.requestReviewers({
            owner,
            repo,
            pull_number: prNumber,
            reviewers: prReviewers
        });
        console.log(`Reviewers assigned: ${prReviewers}`);
    } else {
        console.log(`No reviewers assigned`);
    }
};
