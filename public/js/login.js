document.getElementById('email-form').addEventListener('submit', function(event) {
  event.preventDefault();
  var email = document.getElementById('email').value;
  fetch('/login-codes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify({ email: email })
  }).then(function(response) {
    return response.json().then(function(body) {
      return { ok: response.ok, body: body };
    });
  }).then(function(result) {
    document.getElementById('login-message').textContent = result.body.message || result.body.error || 'Something went wrong';
    if (result.ok) {
      document.getElementById('code-form').hidden = false;
      document.getElementById('code-form').dataset.email = email;
    }
  });
});

document.getElementById('code-form').addEventListener('submit', function(event) {
  event.preventDefault();
  fetch('/sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify({
      email: document.getElementById('code-form').dataset.email,
      code: document.getElementById('code').value
    })
  }).then(function(response) {
    return response.json().then(function(body) {
      return { ok: response.ok, body: body };
    });
  }).then(function(result) {
    if (!result.ok) {
      document.getElementById('login-message').textContent = result.body.error || 'That code is not valid';
      return;
    }
    window.location = '/';
  });
});
