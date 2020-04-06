# Reply to comments on push with updated files

When someone has left a comment asking you to fix something in your pull request and you do it, it is hard for a reviewer to find the exact commit which contained the fix.
This action reacts on each push, find comments, associated with the pull request - and replies to them with links to new commits.

## Usage

Create a workflow (eg: `.github/workflows/comment-on-push.yml` see [Creating a Workflow file](https://help.github.com/en/actions/configuring-and-managing-workflows/configuring-a-workflow#creating-a-workflow-file)):

```
name: 'Comment on push'
on:
  push

jobs:
  comment_if_files_changed:
    runs-on: ubuntu-latest
    name: Comment on push with changed files
    steps:
      - name: Hello world action step
        uses: BusseBu/comment-on-push@master
        with:
          pattern: Example pattern to .test commit message against
          repo-token: ${{ secrets.GITHUB_TOKEN }}
```

A pattern should be specified if you want only certain commits which message follows the pattern to be analyzed.

_Note: This grants access to the `GITHUB_TOKEN` so the action can make calls to GitHub's rest API_

