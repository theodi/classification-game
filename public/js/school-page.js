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

function message(id, text) {
  var el = document.getElementById(id);
  if (el) {
    el.textContent = text || '';
  }
}

function formatCreatedAt(value) {
  if (!value) {
    return '—';
  }
  var date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '—';
  }
  return date.toISOString().slice(0, 10);
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

function loadDetails() {
  return jsonFetch('/schools/' + window.SCHOOL_ID).then(function(school) {
    document.getElementById('school-heading').textContent = school.name;
    var current = document.querySelector('.breadcrumbs [aria-current="page"]');
    if (current) {
      current.textContent = school.name;
    }
    if (window.IS_ADMIN) {
      document.getElementById('name').value = school.name || '';
      document.getElementById('domain').value = school.domain || '';
      document.getElementById('expiresAt').value = school.expiresOn || '';
      message('expiry-status', school.expired ? 'This school is expired. Teachers and students cannot access it until you extend the date.' : '');
    } else {
      document.getElementById('detail-name').textContent = school.name || '';
      document.getElementById('detail-domain').textContent = '@' + (school.domain || '');
      document.getElementById('detail-expires').textContent = school.expiresOn
        ? (school.expiresOn + (school.expired ? ' (expired)' : ''))
        : '—';
    }
    return school;
  }).catch(function(error) {
    message('school-message', error.message);
  });
}

function loadTeachers() {
  return jsonFetch('/schools/' + window.SCHOOL_ID + '/teachers').then(function(rows) {
    var body = document.querySelector('#teachers-table tbody');
    body.innerHTML = '';
    rows.forEach(function(row) {
      var tr = document.createElement('tr');
      tr.innerHTML = '<td>' + row.email + '</td><td>' + row.status + '</td><td></td>';
      var button = document.createElement('button');
      button.textContent = 'Remove';
      button.addEventListener('click', function() {
        jsonFetch('/schools/' + window.SCHOOL_ID + '/teachers/' + row.id, { method: 'DELETE' })
          .then(loadTeachers)
          .catch(function(error) { message('teachers-message', error.message); });
      });
      tr.lastChild.appendChild(button);
      body.appendChild(tr);
    });
    initAdminTable('#teachers-table', {
      order: [[0, 'asc']],
      columnDefs: [{ orderable: false, targets: 2 }]
    });
  }).catch(function(error) {
    message('teachers-message', error.message);
  });
}

function loadSessions() {
  return jsonFetch('/schools/' + window.SCHOOL_ID + '/sessions').then(function(rows) {
    return Promise.all(rows.map(function(session) {
      return jsonFetch('/schools/' + window.SCHOOL_ID + '/sessions/' + session._id + '/results')
        .then(function(results) {
          session._resultCount = results.length;
          return session;
        });
    }));
  }).then(function(rows) {
    var body = document.querySelector('#sessions-table tbody');
    body.innerHTML = '';
    rows.forEach(function(session) {
      var tr = document.createElement('tr');
      tr.className = 'clickable-row';
      tr.dataset.href = '/schools/' + window.SCHOOL_ID + '/sessions/' + session._id;
      tr.innerHTML =
        '<td>' + (session.name || '') + '</td>' +
        '<td>' + formatCreatedAt(session.createdAt) + '</td>' +
        '<td>' + session._resultCount + '</td>';
      body.appendChild(tr);
    });
    initAdminTable('#sessions-table', {
      order: [[1, 'desc']]
    });
    $('#sessions-table tbody').off('click').on('click', 'tr.clickable-row', function() {
      var href = $(this).data('href');
      if (href) {
        window.location = href;
      }
    });
  }).catch(function(error) {
    message('sessions-message', error.message);
  });
}

var teacherModal = document.getElementById('teacher-modal');
var sessionModal = document.getElementById('session-modal');

document.getElementById('open-teacher-modal').addEventListener('click', function() {
  message('teacher-modal-message', '');
  document.getElementById('teacher-email').value = '';
  openModal(teacherModal);
  document.getElementById('teacher-email').focus();
});

document.getElementById('open-session-modal').addEventListener('click', function() {
  message('session-modal-message', '');
  document.getElementById('create-session-form').reset();
  openModal(sessionModal);
  document.getElementById('session-name').focus();
});

document.getElementById('add-teacher-form').addEventListener('submit', function(event) {
  if (event.submitter && event.submitter.value === 'cancel') {
    return;
  }
  event.preventDefault();
  jsonFetch('/schools/' + window.SCHOOL_ID + '/teachers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: document.getElementById('teacher-email').value })
  }).then(function() {
    closeModal(teacherModal);
    message('teachers-message', 'Teacher added');
    return loadTeachers();
  }).catch(function(error) {
    message('teacher-modal-message', error.message);
  });
});

document.getElementById('create-session-form').addEventListener('submit', function(event) {
  if (event.submitter && event.submitter.value === 'cancel') {
    return;
  }
  event.preventDefault();
  jsonFetch('/schools/' + window.SCHOOL_ID + '/sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: document.getElementById('session-name').value
    })
  }).then(function() {
    closeModal(sessionModal);
    message('sessions-message', 'Session created');
    return loadSessions();
  }).catch(function(error) {
    message('session-modal-message', error.message);
  });
});

if (window.IS_ADMIN) {
  document.getElementById('school-form').addEventListener('submit', function(event) {
    event.preventDefault();
    jsonFetch('/schools/' + window.SCHOOL_ID, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: document.getElementById('name').value,
        domain: document.getElementById('domain').value,
        expiresAt: document.getElementById('expiresAt').value
      })
    }).then(function(school) {
      message('school-message', 'Saved');
      document.getElementById('school-heading').textContent = school.name;
      document.getElementById('expiresAt').value = school.expiresOn || '';
      message('expiry-status', school.expired ? 'This school is expired. Teachers and students cannot access it until you extend the date.' : '');
      var current = document.querySelector('.breadcrumbs [aria-current="page"]');
      if (current) {
        current.textContent = school.name;
      }
    }).catch(function(error) {
      message('school-message', error.message);
    });
  });

  var deleteSchool = document.getElementById('delete-school');
  if (deleteSchool) {
    deleteSchool.addEventListener('click', function() {
      if (!confirm('Delete this school?')) {
        return;
      }
      fetch('/schools/' + window.SCHOOL_ID, {
        method: 'DELETE',
        headers: { 'Accept': 'application/json' }
      }).then(function(response) {
        if (response.status === 204) {
          window.location = '/schools';
          return null;
        }
        return response.json().then(function(body) {
          throw new Error(body.error || 'Could not delete');
        });
      }).catch(function(error) {
        message('school-message', error.message);
      });
    });
  }
}

loadDetails().then(function() {
  return Promise.all([loadTeachers(), loadSessions()]);
}).then(function() {
  if (window.location.hash === '#sessions-section') {
    var section = document.getElementById('sessions-section');
    if (section) {
      section.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }
});
