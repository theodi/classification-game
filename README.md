# Setup

The code is under the licence in `LICENSE.md`. The housing data under `data/` and `public/data/` is under the separate licence in `DATA_LICENSE.md` (CC BY-NC-SA 4.0).

1. You need a MongoDB database. Copy `config.env.example` to `config.env` and set the values. School edition uses its own database (`ClassificationGameSchool` by default), not the main edition DB.
2. `npm install`
3. For the card, model, and evaluation scripts: `pip install -r requirements.txt`
4. `node mlgame.js`

Sign-in is an email code, not a password. Set `ADMIN_EMAIL` to create the first admin. Email uses the same config as learning-orchestrator (`EMAIL_*`, Gmail service account / OAuth2, or SMTP). Without email configured, a development server prints the code in its log. A production server will not send a code until email is set.

Admin UI patterns (breadcrumbs, nav labels, no button stacks) are documented in `DESIGN.md`.
