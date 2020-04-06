import * as core from '@actions/core'
import * as github from '@actions/github'
import * as Webhook from '@octokit/webhooks'

async function run(): Promise<void> {
  try {
    const token = core.getInput('repo-token', {required: true})
    const pattern = core.getInput('pattern')
    const client = new github.GitHub(token)
    const {commits, repository} = github.context.payload as Webhook.WebhookPayloadPush
    const owner = repository.owner.login
    const repo = repository.name

    const commitsFollowingPattern = pattern
      ? commits.filter(commit => new RegExp(pattern).test(commit.message))
      : commits
    if (!commitsFollowingPattern.length) {
      console.log(`No commits following the provided pattern: ${pattern}. Exiting...`)
      return
    }

    // we have to get detailed commits because default ones do not have any information about files changed
    core.debug('Getting detailed commits from the push')
    const detailedCommits = await getDetailedCommits(client, commitsFollowingPattern, owner, repo)

    // getting pull requests associated with each commit
    core.debug('Getting pull requests associated with each commit')
    const pullRequests = await getPullRequests(client, detailedCommits, owner, repo)
    if (!pullRequests.length) {
      console.log('No pull requests, associated with commits found. Exiting...')
      return
    }

    // getting rootComments for each pull request
    core.debug('Getting root comments for each pull request')
    const rootComments = await getRootComments(client, pullRequests, owner, repo)
    if (!rootComments.length) {
      console.log('No comments, associated with pull requests found. Exiting...')
      return
    }

    // synchronous because async posting sometimes gives errors
    for (const comment of rootComments) {
      const commitsWithFileFromComment = detailedCommits.filter(commit =>
        commit.files.some(file => file.filename === comment.path)
      )
      const pullRequest = pullRequests.find(pr => pr.url === comment.pull_request_url)
      if (!pullRequest) {
        console.log(`Could not find pull request associated with the comment ${comment.id}.`)
        continue
      }
      const commitLinks = commitsWithFileFromComment.map(
        commit =>
          `[${commit.sha}](https://github.com/${repository.owner.name}/${repository.name}/pull/${pullRequest.number}/commits/${commit.sha})`
      )
      await client.pulls.createReviewCommentReply({
        body: `This file was changed in the following commits: ${commitLinks.join(', ')}.`,
        comment_id: comment.id,
        pull_number: pullRequest.number,
        owner,
        repo
      })
    }
  } catch (error) {
    core.setFailed(error.message)
  }
}

const getDetailedCommits = async (
  client: github.GitHub,
  commits: any[],
  owner: string,
  repo: string
) => {
  const commitsWithFilesRequests = commits.map(async commit =>
    client.repos.getCommit({
      ref: commit.id,
      owner,
      repo
    })
  )
  return (await Promise.all(commitsWithFilesRequests)).map(result => result.data)
}

const getPullRequests = async (
  client: github.GitHub,
  commits: any[],
  owner: string,
  repo: string
) => {
  const pullRequestsRequests = commits.map(async commit =>
    client.repos.listPullRequestsAssociatedWithCommit({
      commit_sha: commit.sha,
      owner,
      repo
    })
  )
  return (await Promise.all(pullRequestsRequests))
    .map(result => result.data)
    .reduce((acc, prs) => [...acc, ...prs], [])
}

const getRootComments = async (
  client: github.GitHub,
  pullRequests: any[],
  owner: string,
  repo: string
) => {
  const commentRequests = pullRequests.map(async pullRequest =>
    client.pulls.listComments({
      pull_number: pullRequest.number,
      owner,
      repo
    })
  )
  return (await Promise.all(commentRequests))
    .map(result => result.data)
    .reduce((acc, rc) => [...acc, ...rc], [])
    .filter(comment => !(comment.in_reply_to_id || !comment.path))
}

run()
