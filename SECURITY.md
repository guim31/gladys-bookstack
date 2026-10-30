# Security policy

## Reporting a vulnerability

Please do **not** report a security problem in a public issue, pull request or
forum post.

Report it privately through GitHub instead: open the **Security** tab of this
repository, then **Report a vulnerability**.

No such button? Private reporting is not enabled yet: open an issue that only
asks the maintainers for a private contact, without any detail of the problem,
and send the report there.

Include, when you can:

- the version of the integration and of Gladys;
- what an attacker can do, and the steps to reproduce it;
- the log lines that help (remove tokens, passwords and addresses first).

The fix ships as a new version of the integration, and the advisory is
published once users can update.

## Supported versions

Only the latest release receives security fixes: update the integration from
Gladys before reporting a problem.

## Scope

In scope: the code of this repository and the Docker image it publishes.

What the integration holds: the BookStack address and an API token (ID and
secret), kept by Gladys in the integration configuration (never logged, never
written to `/data`). `/data` holds a small JSON file with the BookStack
instance id, the time and ids of the newest page change already seen by the
scene triggers, and the changes written by the integration itself. The
container only talks to the BookStack address, over HTTP or HTTPS. With the
token it reads the books, shelves and pages the owner of the token may see, and
it writes only what a scene action asks for: a new page, or a line added at the
end of a page, in an existing book. It never deletes nor moves anything.

Out of scope: Gladys Assistant itself (see its
[security policy](https://github.com/GladysAssistant/Gladys/security/policy)),
and BookStack itself (see the
[BookStack security policy](https://github.com/BookStackApp/BookStack/security/policy)).
