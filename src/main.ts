import * as core from '@actions/core'
import * as github from '@actions/github'
import * as Webhook from '@octokit/webhooks'

async function run(): Promise<void> {
  try {
    const token = core.getInput('repo-token')
    const octokit = new github.GitHub(token)
    const {commits, repository} = github.context.payload as Webhook.WebhookPayloadPush
    const owner = repository.owner.login
    const repo = repository.name

    // We have to get detailed commits because default ones do not have any information about files changed
    const commitsWithFilesRequests = commits.map(async commit =>
      octokit.repos.getCommit({
        ref: commit.id,
        owner,
        repo
      })
    )
    core.debug('Getting detailed commits from the push')
    const commitsWithFiles = (await Promise.all(commitsWithFilesRequests)).map(
      result => result.data
    )

    // getting pull requests associated with each commit, leaving only unique
    const pullRequestsRequests = commitsWithFiles.map(async commit =>
      octokit.repos.listPullRequestsAssociatedWithCommit({
        commit_sha: commit.sha, // eslint-disable-line @typescript-eslint/camelcase
        owner,
        repo
      })
    )
    core.debug('Getting pull requests associated with each commit')
    const pullRequests = (await Promise.all(pullRequestsRequests))
      .map(result => result.data)
      .reduce((acc, prs) => [...acc, ...prs], [])

    // getting rootComments for each pull request
    const commentRequests = pullRequests.map(async pullRequest =>
      octokit.pulls.listComments({
        pull_number: pullRequest.number, // eslint-disable-line @typescript-eslint/camelcase
        owner,
        repo
      })
    )
    core.debug('Getting root comments for each pull request')
    const rootComments = (await Promise.all(commentRequests))
      .map(result => result.data)
      .reduce((acc, rc) => [...acc, ...rc], [])
      .filter(comment => !(comment.in_reply_to_id || !comment.path))

    // synchronous because async posting sometimes gives errors
    for (const comment of rootComments) {
      const uniqueCommitsWithFiles = commitsWithFiles.filter(commit =>
        commit.files.some(file => file.filename === comment.path)
      )
      const pullRequest = pullRequests.find(pr => pr.url === comment.pull_request_url)
      if (!pullRequest) {
        throw new Error('Could not find pull request associated with the comment')
      }
      const commitLinks = uniqueCommitsWithFiles.map(
        commit =>
          `[${commit.sha}](https://github.com/${repository.owner.name}/${repository.name}/pull/${pullRequest.number}/commits/${commit.sha})`
      )
      await octokit.pulls.createReviewCommentReply({
        body: `This file was changed in the following commits: ${commitLinks.join(', ')}.`,
        comment_id: comment.id, // eslint-disable-line @typescript-eslint/camelcase
        pull_number: pullRequest.number, // eslint-disable-line @typescript-eslint/camelcase
        owner,
        repo
      })
    }
  } catch (error) {
    core.setFailed(error.message)
  }
}

run()
