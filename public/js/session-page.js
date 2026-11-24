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

function gameUrl() {
  return window.location.origin + '/game/' + window.SESSION_ID;
}

function round(value) {
  if (value === null || value === undefined || value === '') {
    return '';
  }
  var number = Number(value);
  if (Number.isNaN(number)) {
    return value;
  }
  return Math.round(number * 100) / 100;
}

function averageRuns(result) {
  var values = [];
  for (var i = 1; i <= 4; i++) {
    if (result && result[i] && typeof result[i].player === 'number') {
      values.push(result[i].player);
    }
  }
  if (!values.length) {
    return null;
  }
  return values.reduce(function(sum, value) { return sum + value; }, 0) / values.length;
}

function renderShare() {
  var link = gameUrl();
  document.getElementById('game-link').textContent = link;
  var qrHost = document.getElementById('game-qr');
  qrHost.innerHTML = '';
  if (typeof QRCode !== 'undefined') {
    new QRCode(qrHost, {
      text: link,
      width: 220,
      height: 220
    });
  }
}

function parseInviteEmails(raw) {
  return String(raw || '')
    .split(/[\s,;]+/)
    .map(function(value) { return value.trim(); })
    .filter(Boolean);
}

var sessionEvalSetId = '';
var packCards = [];
var evalSets = null;
var opponents = null;
var featuresLoaded = false;
var groupTree = null;

function loadSession() {
  return jsonFetch('/schools/' + window.SCHOOL_ID + '/sessions/' + window.SESSION_ID).then(function(session) {
    document.getElementById('session-heading').textContent = session.name || 'Session';
    document.getElementById('session-name').value = session.name || '';
    sessionEvalSetId = session.evalSetId || 'E01';
    var current = document.querySelector('.breadcrumbs [aria-current="page"]');
    if (current) {
      current.textContent = session.name || 'Session';
    }
    return session;
  }).catch(function(error) {
    message('session-message', error.message);
  });
}

function loadResults() {
  return jsonFetch('/schools/' + window.SCHOOL_ID + '/sessions/' + window.SESSION_ID + '/results').then(function(rows) {
    var body = document.querySelector('#results-table tbody');
    var empty = document.getElementById('results-empty');
    body.innerHTML = '';
    if ($.fn.dataTable.isDataTable('#results-table')) {
      $('#results-table').DataTable().destroy();
    }
    if (!rows.length) {
      empty.classList.remove('hidden');
      return;
    }
    empty.classList.add('hidden');
    rows.forEach(function(row) {
      if (!row.playerName) {
        return;
      }
      var training = row.confidences ? row.confidences.player : '';
      var written = row.writtenConfidence;
      if (written === null || written === undefined) {
        written = row.confidences ? row.confidences.written : '';
      }
      var result = row.result || {};
      var avg = averageRuns(result);
      var gap = (typeof training === 'number' && typeof avg === 'number')
        ? round(training - avg)
        : '';
      var tr = document.createElement('tr');
      tr.innerHTML =
        '<td>' + row.playerName + '</td>' +
        '<td>' + round(training) + '</td>' +
        '<td>' + round(written) + '</td>' +
        '<td>' + round(result[1] && result[1].player) + '</td>' +
        '<td>' + round(result[2] && result[2].player) + '</td>' +
        '<td>' + round(result[3] && result[3].player) + '</td>' +
        '<td>' + round(result[4] && result[4].player) + '</td>' +
        '<td>' + round(row.score) + '</td>' +
        '<td>' + gap + '</td>' +
        '<td><a href="/result/' + encodeURIComponent(row.id) + '/tree">View</a></td>';
      body.appendChild(tr);
    });
    initAdminTable('#results-table', {
      order: [[7, 'desc']],
      columnDefs: [{ orderable: false, targets: 9 }],
      dom: '<"dt-top"Bf>rt<"dt-bottom"<"dt-length"l><"dt-info"i><"dt-paginate"p>>',
      buttons: ['copy', 'csv', 'excel']
    });
  }).catch(function(error) {
    message('session-message', error.message);
  });
}

function ensureGroupTree() {
  if (!groupTree) {
    groupTree = new SessionTree('#admin-decision-tree');
  }
  return groupTree;
}

function loadTreeData() {
  return Promise.all([
    fetch('/config/features.json').then(function(r) { return r.json(); }),
    fetch('/data/pack.json').then(function(r) { return r.json(); }),
    fetch('/data/eval_sets.json').then(function(r) { return r.json(); }),
    fetch('/data/opponents/group1.json').then(function(r) { return r.json(); })
  ]).then(function(parts) {
    packCards = (parts[1].cards || []).map(function(card, index) {
      var copy = Object.assign({}, card);
      copy.index = index + 1;
      return copy;
    });
    evalSets = parts[2];
    opponents = parts[3];
    ensureGroupTree().setFeatures(parts[0].features || []);
    featuresLoaded = true;
  });
}

function resultIdFor(team) {
  return String(team).slice(0, 40) + '-' + Date.now();
}

function bindGroupTreeUi() {
  var groupModal = document.getElementById('group-modal');
  if (!groupModal || typeof SessionTree === 'undefined') {
    return;
  }
  ensureGroupTree();

  document.getElementById('open-group-modal').addEventListener('click', function() {
    message('group-modal-message', '');
    document.getElementById('group-team').value = '';
    document.getElementById('group-confidence').value = '';
    var ready = featuresLoaded ? Promise.resolve() : loadTreeData();
    ready.then(function() {
      ensureGroupTree().reset();
      openModal(groupModal);
      document.getElementById('group-team').focus();
    }).catch(function(error) {
      message('session-message', error.message || 'Could not load game data');
    });
  });

  document.getElementById('close-group-modal').addEventListener('click', function() {
    closeModal(groupModal);
  });

  document.getElementById('load-sample-tree').addEventListener('click', function() {
    fetch('/data/fixtures/simple-tree.json')
      .then(function(r) { return r.json(); })
      .then(function(fixture) {
        document.getElementById('group-team').value = fixture.teamName || 'Sample team';
        document.getElementById('group-confidence').value =
          fixture.writtenConfidence === undefined ? '' : fixture.writtenConfidence;
        var treeUi = ensureGroupTree();
        if (fixture.ui && fixture.ui.root) {
          treeUi.fromUiRoot(fixture.ui.root);
        } else {
          treeUi.fromGameTree(fixture.tree);
        }
        message('group-modal-message', 'Sample tree loaded');
      })
      .catch(function(error) {
        message('group-modal-message', error.message || 'Could not load sample tree');
      });
  });

  document.getElementById('check-group-tree').addEventListener('click', function() {
    var gameTree = ensureGroupTree().toGameTree();
    var error = SessionTree.validateGameTree(gameTree);
    if (error) {
      message('group-modal-message', error);
      return;
    }
    if (typeof TreeScore === 'undefined') {
      message('group-modal-message', 'Scoring module not loaded');
      return;
    }
    var training = TreeScore.scoreTraining(gameTree, packCards);
    message('group-modal-message', 'Training score on Group 1 pack: ' + training + '%');
  });

  document.getElementById('save-group-tree').addEventListener('click', function() {
    var team = document.getElementById('group-team').value.trim();
    if (!team) {
      message('group-modal-message', 'Enter a team name');
      return;
    }
    var gameTree = ensureGroupTree().toGameTree();
    var error = SessionTree.validateGameTree(gameTree);
    if (error) {
      message('group-modal-message', error);
      return;
    }
    var evalSetId = sessionEvalSetId || 'E01';
    var evalSet = evalSets && evalSets[evalSetId] ? evalSets[evalSetId] : evalSets.E01;
    var scored = TreeScore.scoreEvaluation(gameTree, packCards, evalSet, opponents);
    var written = document.getElementById('group-confidence').value;
    var writtenConfidence = written === '' ? null : Number(written);
    var payload = {
      id: resultIdFor(team),
      playerName: team,
      sessionId: window.SESSION_ID,
      evalSetId: evalSetId,
      tree: gameTree,
      writtenConfidence: writtenConfidence,
      confidences: Object.assign({}, scored.confidences, { written: writtenConfidence }),
      result: scored.result,
      score: scored.score,
      vsHybrid: scored.vsHybrid,
      vsMachine: scored.vsMachine,
      attempt: 1
    };
    message('group-modal-message', 'Saving…');
    fetch('/result', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(payload)
    }).then(function(response) {
      if (!response.ok) {
        return response.text().then(function(text) {
          throw new Error(text || 'Could not save result');
        });
      }
      closeModal(groupModal);
      message('session-message', 'Group result saved for ' + team);
      return loadResults();
    }).catch(function(err) {
      message('group-modal-message', err.message);
    });
  });
}

var inviteModal = document.getElementById('invite-modal');

document.getElementById('game-link').addEventListener('click', function() {
  navigator.clipboard.writeText(gameUrl()).then(function() {
    message('session-message', 'Link copied');
  }).catch(function() {
    message('session-message', 'Could not copy link');
  });
});

document.getElementById('open-invite-modal').addEventListener('click', function() {
  message('invite-message', '');
  document.getElementById('invite-emails').value = '';
  openModal(inviteModal);
  document.getElementById('invite-emails').focus();
});

document.getElementById('invite-form').addEventListener('submit', function(event) {
  if (event.submitter && event.submitter.value === 'cancel') {
    return;
  }
  event.preventDefault();
  var emails = parseInviteEmails(document.getElementById('invite-emails').value);
  if (!emails.length) {
    message('invite-message', 'Enter at least one email address');
    return;
  }
  jsonFetch('/schools/' + window.SCHOOL_ID + '/sessions/' + window.SESSION_ID + '/invites', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ emails: emails })
  }).then(function(result) {
    closeModal(inviteModal);
    message('session-message', result && result.message ? result.message : 'Links sent');
  }).catch(function(error) {
    message('invite-message', error.message);
  });
});

document.getElementById('session-name-form').addEventListener('submit', function(event) {
  event.preventDefault();
  jsonFetch('/schools/' + window.SCHOOL_ID + '/sessions/' + window.SESSION_ID, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: document.getElementById('session-name').value })
  }).then(function() {
    message('details-message', 'Saved');
    return loadSession();
  }).catch(function(error) {
    message('details-message', error.message);
  });
});

document.getElementById('delete-session').addEventListener('click', function() {
  if (!confirm('Delete this session?')) {
    return;
  }
  jsonFetch('/schools/' + window.SCHOOL_ID + '/sessions/' + window.SESSION_ID, { method: 'DELETE' })
    .then(function() {
      window.location = '/schools/' + window.SCHOOL_ID + '#sessions-section';
    })
    .catch(function(error) {
      message('details-message', error.message);
    });
});

bindGroupTreeUi();
renderShare();
Promise.all([loadSession(), loadResults(), loadTreeData()]).catch(function(error) {
  message('session-message', error.message || 'Could not load page data');
});
