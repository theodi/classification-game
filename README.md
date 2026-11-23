# Setup

The code is under the licence in `LICENSE.md`. The housing data under `data/` and `public/data/` is under the separate licence in `DATA_LICENSE.md` (CC BY-NC-SA 4.0).

1. You need a MongoDB database. Copy `config.env.example` to `config.env` and set the values.
2. `npm install`
3. For the card, model, and evaluation scripts: `pip install -r requirements.txt`
4. `node mlgame.js`

Sign-in is an email code, not a password. Set `ADMIN_EMAIL` to create the first admin. Without SMTP settings, a development server prints the code in its log. A production server will not send a code until SMTP is set.
