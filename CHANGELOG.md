# Changelog

## [0.2.0](https://github.com/Zweer/mounted-games/compare/v0.1.0...v0.2.0) (2026-10-01)


### Features

* **cloudflare:** migrate to Cloudflare D1 + Workers (OpenNext) with Cron poller ([ec0948b](https://github.com/Zweer/mounted-games/commit/ec0948b33f8b5e6352e87723748b28ee40e84b65))
* **db:** :recycle: port schema and driver from Postgres to SQLite/D1 ([976207d](https://github.com/Zweer/mounted-games/commit/976207da21314315b5cb114b67eecdc6ea00c573))
* **db:** :recycle: request-scoped D1 via getCloudflareContext (spec 05 ([f63e8d9](https://github.com/Zweer/mounted-games/commit/f63e8d95d215ca85a0182f322c89f0306685be91))
* **db:** :sparkles: implement domain schema as per-domain models ([6e4f590](https://github.com/Zweer/mounted-games/commit/6e4f590bd1bad1c4ab2a71e80bbcaefcbeafc699))
* **ingest:** :sparkles: add archive poll mode for incremental backfill ([2db2ea5](https://github.com/Zweer/mounted-games/commit/2db2ea5c349f8a6170b4beee50d05731be625635))
* **ingest:** :sparkles: add poller foundation and both source scrapers ([771ca72](https://github.com/Zweer/mounted-games/commit/771ca72d42df9ff3bc37ae8e2ef9a4c45dab40e9))
* **ingest:** :sparkles: automatic live-window from the sources' in-progress lists ([fe9242f](https://github.com/Zweer/mounted-games/commit/fe9242fce35a07e6f9ce1fe3748f2a90ce09110f))
* **ingest:** :sparkles: bootstrap target seeding and wire discovery into the poller ([11fe7e0](https://github.com/Zweer/mounted-games/commit/11fe7e031104b784320ba660f05ff7a198288570))
* **ingest:** :sparkles: extract competition dates from source list pages ([36fe310](https://github.com/Zweer/mounted-games/commit/36fe310b62e27c94f3ec5bb32b0d142c505f9754))
* **ingest:** :sparkles: group mg age bands into one event + infer level ([95625c7](https://github.com/Zweer/mounted-games/commit/95625c76f46e858b6898879ed68849853acc2e65))
* **ingest:** :sparkles: guarded scraped-data reset route for backfill ([ed88c89](https://github.com/Zweer/mounted-games/commit/ed88c89a492c1202e6baf5ba6f473cc3f584fdbc))
* **ingest:** :sparkles: implement idempotent persistScrape ([944f20e](https://github.com/Zweer/mounted-games/commit/944f20efdf749f8208eae2910330f21a372e1c5e))
* **ingest:** :sparkles: phase enumeration (target discovery) for both sources ([dc395f0](https://github.com/Zweer/mounted-games/commit/dc395f0e0769351e18752c2138b0a03f5031b364))
* **poller:** :zap: move scheduler to Cron Trigger + KV idle gate ([ae176aa](https://github.com/Zweer/mounted-games/commit/ae176aa72edd087803b3b835954bb4b88f163ef8))
* **web:** :sparkles: archive, competition drill-in and entity pages (heritage) ([32feda2](https://github.com/Zweer/mounted-games/commit/32feda2ac0366a05de964f7896ddbdc1212ebb02))
* **web:** :sparkles: coherent chromed 404 via global-not-found ([45c1088](https://github.com/Zweer/mounted-games/commit/45c1088dc8cf9268f369498472854d31fdbf7143))
* **web:** :sparkles: home and search pages (heritage) ([955615b](https://github.com/Zweer/mounted-games/commit/955615ba5a436a76317193c21e6ede87a3c7dde9))
* **web:** :sparkles: live scoreboard (read layer + /api/live + heritage UI) ([954c90c](https://github.com/Zweer/mounted-games/commit/954c90cdc2fb5352ef1653d14d209c45a7cf6bde))
* **web:** :sparkles: localized heritage shell (next-intl IT/EN + Option C theme) ([f992321](https://github.com/Zweer/mounted-games/commit/f99232125c548032a0013fbbdde997c979449131))
* **web:** :sparkles: read layer for home, archive, entities and search ([32da387](https://github.com/Zweer/mounted-games/commit/32da387f76004b307fecb6e394235a6c2ba43475))


### Bug Fixes

* **cloudflare:** use default export in custom-worker so assets router ([ee9bf07](https://github.com/Zweer/mounted-games/commit/ee9bf07c2d6844f77771b187ac592ada100e30b1))
* **db:** register smart ingestion migration ([3b897e5](https://github.com/Zweer/mounted-games/commit/3b897e53163caa42005d84a440328644d9db1b52))
* **deploy:** run migrations in Vercel build ([4cab339](https://github.com/Zweer/mounted-games/commit/4cab339794d02fb5580dc9a525643cd09d517042))
* **ingest:** chunk scrape_target upsert under D1's 100-bound-param limit ([1b568d4](https://github.com/Zweer/mounted-games/commit/1b568d4147cf17e71b0ffd7530960e2ca2dddd50))
* **scraper:** :bug: generalize pmg final tier to any letter ([5bb122a](https://github.com/Zweer/mounted-games/commit/5bb122aa7946239b0b8af1732cac31c25be538be))
* **scraper:** :bug: mg-scoreboard spec-04 date threading + band vocab ([536800a](https://github.com/Zweer/mounted-games/commit/536800af64ebcdd1823597865dd0286388c9dc50))
* **scraper:** :bug: pmglivescore dates + level, retry transient 503 ([a978fd4](https://github.com/Zweer/mounted-games/commit/a978fd445390cbd01695ae2797932e9503b81534))
* **web:** :bug: point recent-result cards at the parent competition ([3b20678](https://github.com/Zweer/mounted-games/commit/3b20678f1bf5b02c1162f2ef1bd9a68c10a8fb19))


### Performance

* **ingest:** :zap: dedup and parallelize scrape persistence ([e8ca78f](https://github.com/Zweer/mounted-games/commit/e8ca78fef871aa3f8d5f5e489891d717184adf5c))
* **ingest:** add smart bounded dispatcher ([3a70213](https://github.com/Zweer/mounted-games/commit/3a702130870425a69f32ba4d24e67b850ddf00d9))


### Documentation

* :memo: switch license to MIT and add project README ([63d17e2](https://github.com/Zweer/mounted-games/commit/63d17e24ec74395837026045b2bafb639f570064))
* **migration:** :memo: add spec 05 cloudflare-native migration ([1fe04ca](https://github.com/Zweer/mounted-games/commit/1fe04caa7e1c6d2744d226265c17f98ba06554d2))
* **sources:** :memo: complete source contracts and align 01-ingestion ([5fb4878](https://github.com/Zweer/mounted-games/commit/5fb48782c40bf5a9bae32cf49135fc60352b78ae))
* **sources:** :memo: correct mg individual flag and roster facts ([5c3d20c](https://github.com/Zweer/mounted-games/commit/5c3d20c8bfded703eaeed79fc42af2f9d0db6592))
* **sources:** :memo: re-verify mg-scoreboard spec-04 fields ([008c158](https://github.com/Zweer/mounted-games/commit/008c158fcc1fb3e3a59c7aeef1374936666c6af9))
* **sources:** :memo: re-verify pmglivescore spec-04 fields (2026-09-30) ([fe33426](https://github.com/Zweer/mounted-games/commit/fe33426166a01465bbdff45c3bd59b9273ee8769))
* **spec:** :memo: add 02-schema-stats domain schema design ([e3b3594](https://github.com/Zweer/mounted-games/commit/e3b3594a4ac3d3aeb1835eb0bc8c3327d6efc04f))
* **spec:** :memo: add 03-live-archive frontend spec and pick heritage mockup ([5ab9ddd](https://github.com/Zweer/mounted-games/commit/5ab9ddddcf7fcd5355c077f83424e6dee78a6b6f))
* **spec:** :memo: add 04-ingestion-data-quality phase spec ([ea1f82f](https://github.com/Zweer/mounted-games/commit/ea1f82fbefc0892ebc8ddc4cb4b7ca51f7319c60))


### Build System

* **deploy:** :hammer: wire real D1/KV, explicit workers_dev, deploy ([798c506](https://github.com/Zweer/mounted-games/commit/798c50623824a1e365bd6d8aa4362db71f695148))
* **deploy:** :rocket: wrangler cron config, dev.vars template, deploy ([a045984](https://github.com/Zweer/mounted-games/commit/a04598447fb63dbb013c477e666078afb503b68d))
* **runtime:** :hammer: adopt OpenNext for Cloudflare Workers (spec 05 ([a492931](https://github.com/Zweer/mounted-games/commit/a4929316f138184ebbc7071dad9cc0955b7f2a98))
* **web:** :hammer: apply drizzle migrations before build via vercel.json ([b020def](https://github.com/Zweer/mounted-games/commit/b020def3cd97d46d82e18e7c52e5c57c5ca97baa))


### Continuous Integration

* :construction_worker: validate PR commits with commitlint in CI ([e7c67fb](https://github.com/Zweer/mounted-games/commit/e7c67fb138452c1f45632b1c32335aeb285eb8a7))
* **deploy:** :construction_worker: GitHub Actions gate + Release Please + ([9a0db97](https://github.com/Zweer/mounted-games/commit/9a0db97ce352e1e79d87b8b426539d576644bde3))
* **deploy:** :construction_worker: PR-gated CI + Release Please + ([ec1ae44](https://github.com/Zweer/mounted-games/commit/ec1ae44443c67817de119f9909fb717e56c966f9))
