# Published release packages

Keep the current server package and its two immediate predecessors in this branch. Older server packages remain available at their original immutable Git commits. Named legacy-world packages are retained separately.

Both promotion and the VPS updater download a commit archive with a 256 MiB limit. Keeping every historical server tarball in the latest tree eventually prevents new releases from reaching the server. Prune superseded generated server tarballs and their SHA-256 sidecars before publishing a new payload; never remove the archive referenced by the current channel or artifact manifest.
