// This script uses GitHub's Octokit SDK to make API requests.
import { Octokit } from "octokit";

/**
 * Determines the size of a pull request based on the number of files changed and lines added/deleted.
 *
 * @param {Object} params.octokit - An Octokit instance for making GitHub API requests. The token used to create the instance must have `read` permission for pull requests.
 * @param {number} params.prNumber - The number of the pull request.
 * @param {string} params.owner - The owner of the repository where the pull request is located.
 * @param {string} params.repo - The name of the repository where the pull request is located.
 *
 * @returns {Promise<string>} - A promise that resolves to the size of the pull request, which can be "tiny", "small", "medium", or "large".
 *
 */
async function getPullRequestSize({ octokit, prNumber, owner, repo }) {
  const { data } = await octokit.request(
    "GET /repos/{owner}/{repo}/pulls/{pull_number}",
    {
      owner,
      repo,
      pull_number: prNumber,
      headers: {
        "x-github-api-version": "2022-11-28",
      },
    },
  );

  const numberLinesChanged = data.deletions + data.additions;
  const numberFilesChanged = data.changed_files;

  let prSize;
  if (numberFilesChanged < 5 && numberLinesChanged < 10) {
    prSize = "tiny";
  } else if (numberFilesChanged < 10 && numberLinesChanged < 50) {
    prSize = "small";
  } else if (numberFilesChanged < 10 && numberLinesChanged < 250) {
    prSize = "medium";
  } else {
    prSize = "large";
  }

  return prSize;
}

// todo use above
const sizeCutoffs = {
  tiny: { maxFiles: 4, maxLines: 9 },
  small: { maxFiles: 9, maxLines: 49 },
  medium: { maxFiles: 9, maxLines: 249 },
  large: { maxFiles: Infinity, maxLines: Infinity },
};

/**
 * Labels a pull request with a specified size and removes any other size labels.
 *
 * @param {Object} params.octokit - An Octokit instance for making GitHub API requests. The token used to create the instance must have `write` permission for pull requests.
 * @param {number} params.prNumber - The number of the pull request to label.
 * @param {string} params.owner - The owner of the repository where the pull request is located.
 * @param {string} params.repo - The name of the repository where the pull request is located.
 * @param {string} params.size - The size label to add to the pull request.
 *
 * @throws {Error} Throws an error if the size label is invalid.
 *
 * @returns {Promise<void>} A promise that resolves when the pull request labels have been updated.
 */
async function labelPullRequestWithSize({ octokit, prNumber, owner, repo, size }) {
  const allSizes = Object.keys(sizeCutoffs);

  if (!allSizes.includes(size)) {
    throw new Error(`Invalid size label: ${size}`);
  }

  // Add the size label to the pull request
  // and get the labels that are already on the pull request
  // This endpoint is used to add a label to both pull requests and issues
  const { data } = await octokit.request(
    "POST /repos/{owner}/{repo}/issues/{issue_number}/labels",
    {
      owner,
      repo,
      issue_number: prNumber,
      labels: [size],
      headers: {
        "x-github-api-version": "2022-11-28",
      },
    },
  );

  // Remove any other size labels from the pull request
  // This endpoint is used to remove a label from both pull requests and issues
  const currentLabels = data.map(label => label.name);
  const labelsToRemove = allSizes.filter(potentialSize => potentialSize !== size && currentLabels.includes(potentialSize));
  for (const label of labelsToRemove) {
    await octokit.request(
      "DELETE /repos/{owner}/{repo}/issues/{issue_number}/labels/{name}",
      {
        owner,
        repo,
        issue_number: prNumber,
        name: label,
        headers: {
          "x-github-api-version": "2022-11-28",
        },
      },
    );
  }
}

(async () => {
  // Get the values of environment variables that were set by the GitHub Actions workflow.
  const TOKEN = process.env.TOKEN;
  const REPO_OWNER = process.env.REPO_OWNER;
  const REPO_NAME = process.env.REPO_NAME;
  const PR_NUMBER = process.env.PR_NUMBER;

  // Error if any environment variables were not set.
  if (!TOKEN || !REPO_OWNER || !REPO_NAME || !PR_NUMBER) {
    console.error("Missing required environment variables.");
    process.exit(1);
  }

  // Create an instance of `Octokit` using the token value that was set in the GitHub Actions workflow.
  const octokit = new Octokit({
    auth: TOKEN,
  });

  try {
    // Get the size of the pull request.
    const prSize = await getPullRequestSize({
      octokit,
      prNumber: PR_NUMBER,
      owner: REPO_OWNER,
      repo: REPO_NAME,
    });

    // Label the pull request with the size.
    await labelPullRequestWithSize({
      octokit,
      prNumber: PR_NUMBER,
      owner: REPO_OWNER,
      repo: REPO_NAME,
      size: prSize,
    });
  } catch (error) {
    console.error("Error processing the pull request:", error);
    process.exit(1);
  }
})();
