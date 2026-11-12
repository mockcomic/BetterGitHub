# BetterGitHub agent instructions

## codebase-memory project id

The project id for every graph tool call in this repository (`search_graph`, `trace_path`,
`get_architecture`, `get_file_outline`, `get_code_snippet`, `query_graph`, `index_status`) is:

    C-Users-mockcomic-Documents-GitHub-BetterGitHub

Use it verbatim. Do not derive an id from the folder name, the git remote, or the repo path as
typed in the shell — graph calls fail on a mismatched id, and the failure looks like a missing
index rather than a wrong argument.
