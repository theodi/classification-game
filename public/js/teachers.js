function jsonFetch(url, options) {
  options = options || {};
  options.headers = Object.assign({ 'Accept': 'application/json' }, options.headers || {});
  return fetch(url, options).then(function(response) {
    if (response.status === 204) {
      return null;
    }
    return response.json().then(function(body) {
      if (!response.ok) {
        throw new Error(body.error || 'Request failed');
      }
      return body;
    });
  });
}

function message(text) {
  document.getElementById('teachers-message').textContent = text;
}

function loadTeachers() {
  var schoolId = window.SCHOOL_ID;
  jsonFetch('/schools/' + schoolId + '/teachers').then(function(rows) {
    var body = document.querySelector('#teachers-table tbody');
    body.innerHTML = '';
    rows.forEach(function(row) {
      var tr = document.createElement('tr');
      tr.innerHTML = '<td>' + row.email + '</td><td>' + row.status + '</td><td></td>';
      var button = document.createElement('button');
      button.textContent = 'Remove';
      button.addEventListener('click', function() {
        jsonFetch('/schools/' + schoolId + '/teachers/' + row.id, { method: 'DELETE' })
          .then(loadTeachers)
          .catch(function(error) { message(error.message); });
      });
      tr.lastChild.appendChild(button);
      body.appendChild(tr);
    });
    initAdminTable('#teachers-table', {
      order: [[0, 'asc']],
      columnDefs: [{ orderable: false, targets: 2 }]
    });
  }).catch(function(error) { message(error.message); });
}

document.getElementById('add-teacher-form').addEventListener('submit', function(event) {
  event.preventDefault();
  jsonFetch('/schools/' + window.SCHOOL_ID + '/teachers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: document.getElementById('email').value })
  }).then(function() {
    document.getElementById('email').value = '';
    message('Teacher added');
    loadTeachers();
  }).catch(function(error) { message(error.message); });
});

loadTeachers();
