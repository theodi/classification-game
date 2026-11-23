document.getElementById('request-form').addEventListener('submit', function(event) {
  event.preventDefault();
  var selected = document.querySelector('input[name="requestedType"]:checked');
  fetch('/account-requests', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify({
      email: document.getElementById('email').value,
      requestedType: selected ? selected.value : '',
      note: document.getElementById('note').value
    })
  }).then(function(response) {
    return response.json().then(function(body) {
      return { ok: response.ok, body: body };
    });
  }).then(function(result) {
    document.getElementById('request-message').textContent = result.body.message || result.body.error || 'Something went wrong';
  });
});
