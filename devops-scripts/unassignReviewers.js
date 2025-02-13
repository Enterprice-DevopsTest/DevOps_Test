module.exports = async ({ github, context }) => {
    const prNumber = context.payload.pull_request.number;
    const { owner, repo } = context.repo;
    const currentReviewers = await getCurrentReviewers();

    if (currentReviewers.length > 0) {
        // Remove all existing reviewers
        await github.rest.pulls.removeRequestedReviewers({
            owner: owner,
            repo: repo,
            pull_number: prNumber,
            reviewers: currentReviewers 
        });
        console.log(`Unassigned existing reviewers: ${currentReviewers}`);
    } else console.log('No reviewers to unassign');

    // Get all reviews and dismiss approvals if they exist
    const reviews = await github.rest.pulls.listReviews({
        owner,
        repo,
        pull_number: prNumber
    });
    const approvals = reviews.data.filter(review => review.state === "APPROVED");
    for (const approval of approvals) {
        await github.rest.pulls.dismissReview({
            owner,
            repo,
            pull_number: prNumber,
            review_id: approval.id,
            message: "Approval dismissed due to new commit."
        });
        console.log(`Dismissed approval from: ${approval.user.login}`);
    }

    async function getCurrentReviewers() {
        const reviewers = await github.rest.pulls.listRequestedReviewers({
            owner: owner,
            repo: repo,
            pull_number: prNumber
        });

        return reviewers.data.users.map(user => user.login);
    }
};
