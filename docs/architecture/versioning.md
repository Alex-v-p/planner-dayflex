# Versioning policy

## Format and starting point

Use release numbers in the form `vMAJOR.MINOR.PATCH`, for example `v1.2.3`.
The first user-ready MVP release is `v1.0.0`. Repository foundation work and
unreleased development before that point do not receive production release tags.

When the application foundation exists, keep one authoritative version source in
the repository and make the Git release tag match it exactly. A release also
updates the changelog or release notes in the same release PR.

## Increment rules

| Change type | Increment | Examples |
| --- | --- | --- |
| App-wide change or a release that bundles many medium features | Major | `v1.4.2` -> `v2.0.0` |
| One large feature or a coherent medium feature | Minor | `v1.1.0` -> `v1.2.0` |
| Small feature, focused improvement, bug fix, or hotfix | Patch | `v1.0.1` -> `v1.0.2` |

Write all three numeric components even when a conversation uses shorthand such
as “v1.1” or “v2”. For example, the release tag is `v1.2.0`, not `v1.2`.

The release manager proposes the increment, explains it in the release PR, and
the human owner makes the final decision. If a ticket changes an external
contract in a way users or integrations cannot adopt safely, treat that as at
least a major-release discussion even if the code diff is small.

## Release flow

1. Ticket PRs integrate into `develop`.
2. A release PR moves `develop` to `main` and includes the version update,
   changelog/release notes, migration notes, risks, and verification steps.
3. The human merges the release PR after checks pass.
4. Automation tags the merged `main` commit as `vMAJOR.MINOR.PATCH` and runs
   the configured deployment.

Until the post-foundation release-automation ticket is complete, steps 2–4 are
documented manual release work. Do not pretend the placeholder workflows provide
application CI or deployment.
