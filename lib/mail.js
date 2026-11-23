const crypto = require('crypto');
const nodemailer = require('nodemailer');

function configured() {
  return !!(process.env.SMTP_HOST && process.env.SMTP_FROM);
}

async function sendLoginCode(email, code) {
  if (!configured()) {
    if (process.env.NODE_ENV === 'production') {
      const error = new Error('Email is not configured');
      error.code = 'NO_MAIL';
      throw error;
    }
    console.log('Login code for ' + email + ': ' + code);
    return;
  }
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_SECURE === 'true',
    auth: process.env.SMTP_USER ? {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    } : undefined
  });
  await transporter.sendMail({
    from: process.env.SMTP_FROM,
    to: email,
    subject: 'Your classification game code',
    text: 'Your sign-in code is ' + code + '. It expires in 10 minutes.\n\nIf you did not ask for this, you can ignore the email.'
  });
}

function hashCode(email, code) {
  return crypto.createHash('sha256').update((process.env.CODE_PEPPER || 'school-game') + ':' + email + ':' + code).digest('hex');
}

module.exports = {
  configured: configured,
  sendLoginCode: sendLoginCode,
  hashCode: hashCode
};
