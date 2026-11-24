function jsonFetch(url, options) {
  options = options || {};
  options.headers = Object.assign({ 'Accept': 'application/json' }, options.headers || {});
  return fetch(url, options).then(function(response) {
    return response.json().then(function(body) {
      if (!response.ok) {
        throw new Error(body.error || 'Request failed');
      }
      return body;
    });
  });
}

function message(id, text) {
  var el = document.getElementById(id);
  if (el) {
    el.textContent = text || '';
  }
}

function openModal(dialog) {
  if (dialog && typeof dialog.showModal === 'function') {
    dialog.showModal();
  }
}

function closeModal(dialog) {
  if (dialog && dialog.open) {
    dialog.close();
  }
}

function loadSchools() {
  return jsonFetch('/schools').then(function(rows) {
    var body = document.querySelector('#schools-table tbody');
    body.innerHTML = '';
    rows.forEach(function(row) {
      var tr = document.createElement('tr');
      tr.className = 'clickable-row';
      tr.dataset.href = '/schools/' + row.id;
      var expiryLabel = row.expiresOn || '—';
      if (row.expired) {
        expiryLabel = (row.expiresOn || 'Unset') + ' (expired)';
      }
      tr.innerHTML =
        '<td>' + row.name + '</td>' +
        '<td>@' + row.domain + '</td>' +
        '<td>' + expiryLabel + '</td>' +
        '<td>' + (row.teacherCount || 0) + '</td>' +
        '<td>' + (row.sessionCount || 0) + '</td>';
      body.appendChild(tr);
    });
    initAdminTable('#schools-table', { order: [[0, 'asc']] });
    $('#schools-table tbody').off('click').on('click', 'tr.clickable-row', function() {
      var href = $(this).data('href');
      if (href) {
        window.location = href;
      }
    });
  }).catch(function(error) {
    message('schools-message', error.message);
  });
}

var schoolModal = document.getElementById('school-modal');

document.getElementById('open-school-modal').addEventListener('click', function() {
  message('school-modal-message', '');
  document.getElementById('create-school-form').reset();
  openModal(schoolModal);
  document.getElementById('school-name').focus();
});

document.getElementById('create-school-form').addEventListener('submit', function(event) {
  if (event.submitter && event.submitter.value === 'cancel') {
    return;
  }
  event.preventDefault();
  jsonFetch('/schools', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: document.getElementById('school-name').value,
      domain: document.getElementById('school-domain').value,
      expiresAt: document.getElementById('school-expiresAt').value
    })
  }).then(function(school) {
    closeModal(schoolModal);
    window.location = '/schools/' + school.id;
  }).catch(function(error) {
    message('school-modal-message', error.message);
  });
});

loadSchools();
