# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

## [1.0.0] - 2026-10-30

### Added

- A BookStack device: books, shelves, pages, pages changed today, and the name
  of the latest changed page; one device per book with its number of pages.
- The "BookStack" dashboard widget: three tiles and the pages changed last, of
  every book or of one.
- Scene triggers "BookStack page created or updated" (filtered by book and by
  kind of change) and "Tagged BookStack page changed" (filtered by tag), silent
  at installation, remembered across restarts.
- Scene actions "Create a BookStack page" (Markdown content, tags) and "Add a
  line to a BookStack page" (a dated journal, created at its first line).
- Texts and documentation in English, French, German and Spanish.

[Unreleased]: https://github.com/guim31/gladys-bookstack/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/guim31/gladys-bookstack/releases/tag/v1.0.0
