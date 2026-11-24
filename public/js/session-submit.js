function message(id, text) {
  var el = document.getElementById(id);
  if (el) {
    el.textContent = text || '';
  }
}

function leafNode(city) {
  return { mode: 'leaf', city: city || '' };
}

function splitNode(feature, threshold, left, right) {
  return {
    mode: 'split',
    feature: feature || '',
    threshold: threshold === undefined || threshold === null ? '' : String(threshold),
    left: left || leafNode(''),
    right: right || leafNode('')
  };
}

var features = [];
var packCards = [];
var evalSets = null;
var opponents = null;
var rootNode = splitNode('', '', leafNode(''), leafNode(''));

function featureOptionsHtml(selected) {
  var html = '<option value="">Choose a feature</option>';
  features.forEach(function(feature) {
    html += '<option value="' + feature.column + '"' +
      (selected === feature.column ? ' selected' : '') + '>' + feature.label + '</option>';
  });
  return html;
}

function cityOptionsHtml(selected, allowSplit) {
  var html = '<option value="">Choose</option>';
  ['New York', 'San Francisco'].forEach(function(city) {
    html += '<option value="' + city + '"' + (selected === city ? ' selected' : '') + '>' + city + '</option>';
  });
  if (allowSplit) {
    html += '<option value="split"' + (selected === 'split' ? ' selected' : '') + '>Split again</option>';
  }
  return html;
}

function renderSide(path, side, node, depth) {
  var childPath = path + side;
  var allowSplit = depth < 2;
  var modeValue = node.mode === 'split' ? 'split' : (node.city || '');
  var html = '<div class="tree-side tree-side-' + side + '" data-path="' + childPath + '">';
  html += '<div class="tree-side-label">' + (side === 'l' ? '≤ threshold' : '> threshold') + '</div>';
  html += '<label>Outcome <select class="tree-mode" data-path="' + childPath + '">' +
    cityOptionsHtml(modeValue, allowSplit) + '</select></label>';
  if (node.mode === 'split') {
    html += renderSplit(childPath, node, depth + 1);
  }
  html += '</div>';
  return html;
}

function renderSplit(path, node, depth) {
  var html = '<div class="tree-node" data-path="' + path + '" data-depth="' + depth + '">';
  html += '<div class="tree-node-card">';
  html += '<div class="tree-node-title">' + (path === '' ? 'Top split' : 'Split at ' + path) + '</div>';
  html += '<label>Feature <select class="tree-feature" data-path="' + path + '">' +
    featureOptionsHtml(node.feature) + '</select></label>';
  html += '<label>Threshold <input class="tree-threshold" data-path="' + path +
    '" type="number" step="any" value="' + (node.threshold || '') + '"></label>';
  html += '</div>';
  html += '<div class="tree-children">';
  html += renderSide(path, 'l', node.left || leafNode(''), depth);
  html += renderSide(path, 'r', node.right || leafNode(''), depth);
  html += '</div></div>';
  return html;
}

function findNode(path) {
  if (path === '') {
    return rootNode;
  }
  var node = rootNode;
  for (var i = 0; i < path.length; i++) {
    var side = path.charAt(i);
    if (!node || node.mode !== 'split') {
      return null;
    }
    node = side === 'l' ? node.left : node.right;
  }
  return node;
}

function parentPath(path) {
  return path.slice(0, -1);
}

function setChild(path, child) {
  if (path === '') {
    rootNode = child;
    return;
  }
  var parent = findNode(parentPath(path));
  if (!parent || parent.mode !== 'split') {
    return;
  }
  if (path.slice(-1) === 'l') {
    parent.left = child;
  } else {
    parent.right = child;
  }
}

function readControlsIntoState() {
  document.querySelectorAll('.tree-feature').forEach(function(select) {
    var node = findNode(select.getAttribute('data-path'));
    if (node && node.mode === 'split') {
      node.feature = select.value;
    }
  });
  document.querySelectorAll('.tree-threshold').forEach(function(input) {
    var node = findNode(input.getAttribute('data-path'));
    if (node && node.mode === 'split') {
      node.threshold = input.value;
    }
  });
  document.querySelectorAll('.tree-mode').forEach(function(select) {
    var path = select.getAttribute('data-path');
    var value = select.value;
    var existing = findNode(path);
    if (value === 'split') {
      if (!existing || existing.mode !== 'split') {
        setChild(path, splitNode('', '', leafNode(''), leafNode('')));
      }
    } else {
      setChild(path, leafNode(value));
    }
  });
}

function renderTree() {
  var host = document.getElementById('tree-builder');
  host.innerHTML = renderSplit('', rootNode, 0);
  host.querySelectorAll('.tree-mode').forEach(function(select) {
    select.addEventListener('change', function() {
      readControlsIntoState();
      renderTree();
    });
  });
  host.querySelectorAll('.tree-feature, .tree-threshold').forEach(function(el) {
    el.addEventListener('change', readControlsIntoState);
    el.addEventListener('input', readControlsIntoState);
  });
}

function boundaryKey(path) {
  return path === '' ? 'a' : path + 'a';
}

function factorKey(path) {
  return path === '' ? '_' : path;
}

function collectTree() {
  readControlsIntoState();
  var factors = {};
  var boundaries = {};
  var predictions = {};

  function walk(path, node) {
    if (!node) {
      return;
    }
    if (node.mode === 'leaf') {
      if (node.city) {
        predictions[path] = { prediction: node.city };
      }
      return;
    }
    if (node.feature) {
      factors[factorKey(path)] = node.feature;
    }
    if (node.threshold !== '' && node.threshold !== undefined && node.threshold !== null) {
      boundaries[boundaryKey(path)] = String(node.threshold);
    }
    walk(path + 'l', node.left);
    walk(path + 'r', node.right);
  }

  walk('', rootNode);
  return { factors: factors, boundaries: boundaries, predictions: predictions };
}

function applyUiTree(uiRoot) {
  function convert(node) {
    if (!node || node.mode === 'leaf') {
      return leafNode(node && node.city ? node.city : '');
    }
    return splitNode(
      node.feature,
      node.threshold,
      convert(node.left),
      convert(node.right)
    );
  }
  rootNode = convert(uiRoot);
  renderTree();
}

function validateTree(tree) {
  if (!tree.factors || !tree.factors._) {
    return 'Choose a feature for the top split';
  }
  if (!tree.boundaries || tree.boundaries.a === undefined || tree.boundaries.a === '') {
    return 'Enter a threshold for the top split';
  }
  if (!tree.predictions || !Object.keys(tree.predictions).length) {
    return 'Set city predictions on the leaf nodes';
  }
  return null;
}

function loadData() {
  return Promise.all([
    fetch('/config/features.json').then(function(r) { return r.json(); }),
    fetch('/data/pack.json').then(function(r) { return r.json(); }),
    fetch('/data/eval_sets.json').then(function(r) { return r.json(); }),
    fetch('/data/opponents/group1.json').then(function(r) { return r.json(); })
  ]).then(function(parts) {
    features = parts[0].features || [];
    packCards = (parts[1].cards || []).map(function(card, index) {
      var copy = Object.assign({}, card);
      copy.index = index + 1;
      return copy;
    });
    evalSets = parts[2];
    opponents = parts[3];
  });
}

function resultIdFor(team) {
  return String(team).slice(0, 40) + '-' + Date.now();
}

document.getElementById('load-sample').addEventListener('click', function() {
  fetch('/data/fixtures/simple-tree.json')
    .then(function(r) { return r.json(); })
    .then(function(fixture) {
      document.getElementById('team-name').value = fixture.teamName || 'Sample team';
      document.getElementById('written-confidence').value =
        fixture.writtenConfidence === undefined ? '' : fixture.writtenConfidence;
      if (fixture.ui && fixture.ui.root) {
        applyUiTree(fixture.ui.root);
      }
      message('submit-message', 'Sample tree loaded');
      message('check-message', '');
    })
    .catch(function(error) {
      message('submit-message', error.message || 'Could not load sample tree');
    });
});

document.getElementById('check-tree').addEventListener('click', function() {
  var tree = collectTree();
  var error = validateTree(tree);
  if (error) {
    message('check-message', error);
    return;
  }
  var training = TreeScore.scoreTraining(tree, packCards);
  message('check-message', 'Training score on Group 1 pack: ' + training + '%');
});

document.getElementById('save-tree').addEventListener('click', function() {
  var team = document.getElementById('team-name').value.trim();
  if (!team) {
    message('submit-message', 'Enter a team name');
    return;
  }
  var tree = collectTree();
  var error = validateTree(tree);
  if (error) {
    message('submit-message', error);
    return;
  }
  var evalSetId = window.EVAL_SET_ID || 'E01';
  var evalSet = evalSets && evalSets[evalSetId] ? evalSets[evalSetId] : evalSets.E01;
  var scored = TreeScore.scoreEvaluation(tree, packCards, evalSet, opponents);
  var written = document.getElementById('written-confidence').value;
  var writtenConfidence = written === '' ? null : Number(written);
  var payload = {
    id: resultIdFor(team),
    playerName: team,
    sessionId: window.SESSION_ID,
    evalSetId: evalSetId,
    tree: tree,
    writtenConfidence: writtenConfidence,
    confidences: Object.assign({}, scored.confidences, { written: writtenConfidence }),
    result: scored.result,
    score: scored.score,
    vsHybrid: scored.vsHybrid,
    vsMachine: scored.vsMachine,
    attempt: 1
  };
  message('submit-message', 'Saving…');
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
    window.location = '/schools/' + window.SCHOOL_ID + '/sessions/' + window.SESSION_ID;
  }).catch(function(err) {
    message('submit-message', err.message);
  });
});

loadData().then(function() {
  renderTree();
}).catch(function(error) {
  message('submit-message', error.message || 'Could not load game data');
});
