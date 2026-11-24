(function(global) {
  var MAX_DEPTH = 2;

  function leaf(city, pending, hideCards) {
    var hasCity = !!(city && String(city).trim());
    var isPending = pending;
    if (isPending !== true && isPending !== false) {
      isPending = !hasCity;
    }
    return {
      mode: 'leaf',
      city: city || '',
      pending: isPending,
      hideCards: !!hideCards
    };
  }

  function split(feature, threshold, left, right) {
    return {
      mode: 'split',
      feature: feature || '',
      threshold: threshold === undefined || threshold === null ? '' : String(threshold),
      left: left || leaf('', true),
      right: right || leaf('', true)
    };
  }

  function clone(node) {
    if (!node || node.mode === 'leaf') {
      return leaf(node && node.city, node && node.pending, node && node.hideCards);
    }
    return split(node.feature, node.threshold, clone(node.left), clone(node.right));
  }

  function emptyRoot() {
    return split('', '', leaf('', true), leaf('', true));
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function featureOptions(features, selected) {
    var html = '<option value="">Choose feature</option>';
    (features || []).forEach(function(feature) {
      html += '<option value="' + escapeHtml(feature.column) + '"' +
        (selected === feature.column ? ' selected' : '') + '>' +
        escapeHtml(feature.label) + '</option>';
    });
    return html;
  }

  function cityOptions(selected, fullNames) {
    var html = '<option value="">City?</option>';
    var cities = fullNames
      ? [
          { value: 'New York', label: 'New York' },
          { value: 'San Francisco', label: 'San Francisco' }
        ]
      : [
          { value: 'New York', label: 'NY' },
          { value: 'San Francisco', label: 'SF' }
        ];
    cities.forEach(function(city) {
      html += '<option value="' + city.value + '"' +
        (selected === city.value ? ' selected' : '') + '>' + city.label + '</option>';
    });
    return html;
  }

  function cityDisplayHtml(city) {
    if (city === 'San Francisco') {
      return 'San<br>Francisco';
    }
    if (city === 'New York') {
      return 'New York';
    }
    return 'City?';
  }

  function syncCityDisplay(select) {
    if (!select) {
      return;
    }
    var label = select.parentNode && select.parentNode.querySelector('.flow-city-display');
    if (label) {
      label.innerHTML = cityDisplayHtml(select.value);
    }
  }

  function trashButton(path, action) {
    return '<button type="button" class="flow-trash" data-tree-action="' + action +
      '" data-path="' + escapeHtml(path) + '" title="Remove" aria-label="Remove">' +
      '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M4 7h16"/><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>' +
      '<path d="M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13"/>' +
      '<path d="M10 11v6"/><path d="M14 11v6"/>' +
      '</svg></button>';
  }

  function eyeButton(path, cardsHidden) {
    var title = cardsHidden ? 'Show cards' : 'Hide cards';
    var svg;
    if (cardsHidden) {
      svg = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">' +
        '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/>' +
        '<circle cx="12" cy="12" r="3"/>' +
        '</svg>';
    } else {
      svg = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">' +
        '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/>' +
        '<circle cx="12" cy="12" r="3"/>' +
        '<path d="M4 4l16 16"/>' +
        '</svg>';
    }
    return '<button type="button" class="flow-eye" data-tree-action="toggle-cards" data-path="' +
      escapeHtml(path) + '" title="' + title + '" aria-label="' + title + '" aria-pressed="' +
      (cardsHidden ? 'true' : 'false') + '">' + svg + '</button>';
  }

  function SessionTree(host, options) {
    options = options || {};
    this.host = typeof host === 'string' ? document.querySelector(host) : host;
    this.features = options.features || [];
    this.mode = options.mode === 'game' ? 'game' : 'admin';
    this.afterRender = typeof options.afterRender === 'function' ? options.afterRender : null;
    this.onChange = typeof options.onChange === 'function' ? options.onChange : null;
    this.renderLeafFooter = typeof options.renderLeafFooter === 'function' ? options.renderLeafFooter : null;
    this.root = emptyRoot();
    this._bound = false;
  }

  SessionTree.prototype.notifyChange = function() {
    if (this.onChange) {
      this.onChange(this);
    }
  };

  SessionTree.prototype.finishRender = function() {
    if (this.mode === 'admin') {
      this.placeTeamRail();
    }
    if (this.afterRender) {
      this.afterRender(this);
    }
    this.bind();
  };

  SessionTree.prototype.setFeatures = function(features) {
    this.features = features || [];
    this.render();
  };

  SessionTree.prototype.reset = function() {
    this.root = emptyRoot();
    this.render();
  };

  SessionTree.prototype.getRoot = function() {
    return clone(this.root);
  };

  SessionTree.prototype.setRoot = function(node) {
    this.root = node && node.mode === 'split' ? clone(node) : emptyRoot();
    this.render();
  };

  SessionTree.prototype.find = function(path) {
    if (!path) {
      return this.root;
    }
    var node = this.root;
    for (var i = 0; i < path.length; i++) {
      if (!node || node.mode !== 'split') {
        return null;
      }
      node = path.charAt(i) === 'l' ? node.left : node.right;
    }
    return node;
  };

  SessionTree.prototype.setChild = function(path, child) {
    if (!path) {
      this.root = child;
      return;
    }
    var parent = this.find(path.slice(0, -1));
    if (!parent || parent.mode !== 'split') {
      return;
    }
    if (path.slice(-1) === 'l') {
      parent.left = child;
    } else {
      parent.right = child;
    }
  };

  SessionTree.prototype.readFromDom = function() {
    var self = this;
    if (!this.host) {
      return;
    }
    this.host.querySelectorAll('[data-tree-feature]').forEach(function(select) {
      var node = self.find(select.getAttribute('data-path') || '');
      if (node && node.mode === 'split') {
        node.feature = select.value;
      }
    });
    this.host.querySelectorAll('[data-tree-threshold]:not([disabled])').forEach(function(input) {
      var node = self.find(input.getAttribute('data-path') || '');
      if (node && node.mode === 'split') {
        node.threshold = input.value;
      }
    });
    this.host.querySelectorAll('[data-tree-city]').forEach(function(select) {
      var path = select.getAttribute('data-path') || '';
      var value = select.value;
      var node = self.find(path);
      if (node && node.mode === 'leaf') {
        node.city = value;
        node.pending = false;
      } else if (!node || node.mode !== 'split') {
        self.setChild(path, leaf(value, false));
      }
    });
  };

  SessionTree.prototype.renderDecision = function(path, node, depth) {
    var isRoot = path === '';
    var showTeamSlot = isRoot && this.mode === 'admin';
    var html = '<div class="flow-node flow-decision" data-path="' + escapeHtml(path) + '">';
    if (showTeamSlot) {
      html += '<div class="flow-root-head">';
      html += '<div class="flow-root-side flow-root-side--left" data-tree-team-slot></div>';
    } else if (isRoot) {
      html += '<div class="flow-root-head flow-root-head--game">';
    }
    html += '<div class="flow-decision-wrap" data-tree-open-feature>';
    html += '<span class="flow-decision-diamond" aria-hidden="true"></span>';
    html += '<div class="flow-decision-card">';
    html += '<div class="flow-field flow-field--feature"><select data-tree-feature data-path="' +
      escapeHtml(path) + '" aria-label="Feature">' +
      featureOptions(this.features, node.feature) + '</select></div>';
    if (path) {
      html += trashButton(path, 'delete-node');
    }
    html += '</div></div>';
    if (showTeamSlot) {
      html += '<div class="flow-root-side flow-root-side--right" aria-hidden="true"></div>';
      html += '</div>';
    } else if (isRoot) {
      html += '</div>';
    }

    html += '<div class="flow-fork">';
    html += '<div class="flow-fork-stem"></div>';
    html += '<div class="flow-branches">';
    html += this.renderBranch(path, 'l', node.left, node.threshold, depth);
    html += this.renderBranch(path, 'r', node.right, node.threshold, depth);
    html += '</div></div></div>';
    return html;
  };

  SessionTree.prototype.renderBranch = function(path, side, node, threshold, depth) {
    var childPath = path + side;
    var isLeft = side === 'l';
    var label = isLeft ? '≤' : '>';
    var thresholdValue = threshold || '';
    var html = '<div class="flow-branch flow-branch--' + side + '">';
    html += '<div class="flow-edge">';
    html += '<span class="flow-edge-drop" aria-hidden="true"></span>';
    html += '<label class="flow-edge-threshold">';
    html += '<span class="flow-edge-sign">' + label + '</span>';
    if (isLeft) {
      html += '<input data-tree-threshold data-path="' + escapeHtml(path) +
        '" type="number" inputmode="decimal" value="' + escapeHtml(thresholdValue) +
        '" aria-label="Threshold">';
    } else {
      html += '<input class="flow-threshold-mirror" type="number" inputmode="decimal" value="' +
        escapeHtml(thresholdValue) + '" disabled aria-label="Threshold">';
    }
    html += '</label>';
    html += '<span class="flow-edge-drop" aria-hidden="true"></span>';
    html += '<span class="flow-edge-arrow" aria-hidden="true"></span>';
    html += '</div>';
    html += '<div class="flow-child">';
    html += this.renderNode(childPath, node || leaf(''), depth + 1);
    html += '</div></div>';
    return html;
  };

  SessionTree.prototype.renderLeaf = function(path, node, depth) {
    var allowSplit = depth <= MAX_DEPTH;
    var city = (node && node.city) || '';
    var showChooser = allowSplit && (!node || node.pending !== false) && !city;
    var cardsHidden = !!(node && node.hideCards);
    var isGame = this.mode === 'game';
    var html = '<div class="flow-node flow-leaf" data-path="' + escapeHtml(path) + '">';
    if (!isGame || !showChooser) {
      html += '<div class="flow-leaf-card">';
      if (showChooser) {
        html += '<div class="flow-leaf-actions">';
        html += '<button type="button" class="flow-leaf-btn" data-tree-action="predict" data-path="' +
          escapeHtml(path) + '">End branch</button>';
        html += '<button type="button" class="flow-leaf-btn" data-tree-action="branch" data-path="' +
          escapeHtml(path) + '">Add branch</button>';
        html += '</div>';
      } else {
        html += '<div class="flow-city-row' + (isGame ? ' flow-city-row--full' : '') + '">';
        html += '<label class="flow-field flow-field--city">';
        if (isGame) {
          html += '<span class="flow-city-display" aria-hidden="true">' + cityDisplayHtml(city) + '</span>';
        }
        html += '<select data-tree-city data-path="' + escapeHtml(path) + '" aria-label="City">' +
          cityOptions(city, isGame) + '</select>';
        html += '</label>';
        if (isGame) {
          html += eyeButton(path, cardsHidden);
        }
        html += trashButton(path, 'delete-city');
        html += '</div>';
      }
      html += '</div>';
    }
    if (this.renderLeafFooter) {
      html += this.renderLeafFooter(path, node, depth) || '';
    } else if (isGame) {
      var stackClass = depth <= 1 ? 'game-leaf-dropzone--cols2' : 'game-leaf-dropzone--cols1';
      html += '<div class="game-leaf-slot ' + stackClass +
        (cardsHidden ? ' game-leaf-slot--collapsed' : '') + '">';
      html += '<div id="box_' + escapeHtml(path) +
        '" class="cardbox game-leaf-dropzone" data-tree-dropzone data-path="' +
        escapeHtml(path) + '"></div>';
      html += '<div class="game-leaf-hover">';
      if (showChooser) {
        html += '<button type="button" class="flow-leaf-btn" data-tree-action="predict" data-path="' +
          escapeHtml(path) + '">End branch</button>';
        if (allowSplit) {
          html += '<button type="button" class="flow-leaf-btn" data-tree-action="branch" data-path="' +
            escapeHtml(path) + '">Add branch</button>';
        }
      }
      html += '<button type="button" class="flow-leaf-btn game-leaf-browse" data-browse-cluster="' +
        escapeHtml(path) + '">Browse cluster</button>';
      html += '</div></div>';
    }
    html += '</div>';
    return html;
  };

  SessionTree.prototype.renderNode = function(path, node, depth) {
    if (node && node.mode === 'split') {
      return this.renderDecision(path, node, depth);
    }
    return this.renderLeaf(path, node, depth);
  };

  SessionTree.prototype.placeTeamRail = function() {
    var slot = this.host && this.host.querySelector('[data-tree-team-slot]');
    var rail = document.getElementById('group-team-rail');
    if (slot && rail) {
      slot.appendChild(rail);
    }
  };

  SessionTree.prototype.parkCardsBeforeRender = function() {
    if (this.mode !== 'game' || !this.host) {
      return;
    }
    var tray = document.getElementById('training-set');
    if (!tray) {
      return;
    }
    this.host.querySelectorAll('card, .draggable').forEach(function(card) {
      tray.appendChild(card);
    });
  };

  SessionTree.prototype.render = function() {
    if (!this.host) {
      return;
    }
    this.parkCardsBeforeRender();
    if (this.mode === 'admin') {
      var rail = document.getElementById('group-team-rail');
      var park = this.host.parentNode;
      if (rail && park && rail.parentNode !== park) {
        park.insertBefore(rail, this.host);
      }
    }
    this.host.innerHTML = '<div class="flow-tree">' + this.renderDecision('', this.root, 0) + '</div>';
    this.finishRender();
  };

  SessionTree.prototype.setEditable = function(editable) {
    if (!this.host) {
      return;
    }
    this.host.querySelectorAll('select, input, button').forEach(function(el) {
      if (el.classList.contains('flow-threshold-mirror')) {
        el.disabled = true;
        return;
      }
      if (el.closest('#game-play-actions')) {
        return;
      }
      el.disabled = !editable;
    });
  };

  SessionTree.prototype.applyLeafCities = function(cityMap, options) {
    var self = this;
    var hideCards = !options || options.hideCards !== false;
    var needsRender = false;
    Object.keys(cityMap || {}).forEach(function(path) {
      var city = cityMap[path];
      if (!city || city === '?') {
        return;
      }
      var node = self.find(path);
      if (node && node.mode === 'leaf') {
        var wasPending = node.pending !== false || !node.city;
        node.city = city;
        node.pending = false;
        if (hideCards && wasPending) {
          node.hideCards = true;
          needsRender = true;
        }
        var select = self.host && self.host.querySelector('select[data-tree-city][data-path="' + path + '"]');
        if (select) {
          select.value = city;
          syncCityDisplay(select);
        } else {
          needsRender = true;
        }
      } else if (!node || node.mode !== 'split') {
        self.setChild(path, leaf(city, false, hideCards));
        needsRender = true;
      }
    });
    if (needsRender) {
      this.render();
    } else if (typeof this.onChange === 'function') {
      this.onChange(this);
    }
  };

  SessionTree.prototype.syncThresholdMirrors = function(source) {
    if (!source) {
      return;
    }
    var fork = source.closest('.flow-fork');
    if (!fork) {
      return;
    }
    fork.querySelectorAll('.flow-threshold-mirror').forEach(function(mirror) {
      mirror.value = source.value;
    });
  };

  SessionTree.prototype.bind = function() {
    var self = this;
    if (!this.host || this._bound) {
      return;
    }
    this._bound = true;

    this.host.addEventListener('click', function(event) {
      var button = event.target.closest('[data-tree-action]');
      if (button && self.host.contains(button)) {
        var path = button.getAttribute('data-path') || '';
        var action = button.getAttribute('data-tree-action');
        self.readFromDom();
        if (action === 'branch') {
          self.setChild(path, split('', '', leaf('', true), leaf('', true)));
        } else if (action === 'predict') {
          var city = '';
          if (typeof majorityCityForBox === 'function') {
            city = majorityCityForBox(path);
          }
          if (city && city !== '?') {
            self.setChild(path, leaf(city, false, true));
            if (typeof predictions !== 'undefined') {
              if (!predictions[path]) {
                predictions[path] = {};
              }
              predictions[path].prediction = city;
            }
          } else {
            // Tie or empty: open the city picker so the user can choose.
            self.setChild(path, leaf('', false, true));
          }
        } else if (action === 'toggle-cards') {
          var leafNode = self.find(path);
          if (leafNode && leafNode.mode === 'leaf') {
            leafNode.hideCards = !leafNode.hideCards;
          }
        } else if (action === 'delete-node') {
          if (path) {
            self.setChild(path, leaf('', true));
          }
        } else if (action === 'delete-city') {
          var depth = path.length;
          if (depth <= MAX_DEPTH) {
            self.setChild(path, leaf('', true));
          } else {
            self.setChild(path, leaf('', false));
          }
        }
        self.render();
        self.notifyChange();
        return;
      }

      var wrap = event.target.closest('[data-tree-open-feature]');
      if (!wrap || !self.host.contains(wrap) || event.target.closest('select,button')) {
        return;
      }
      var select = wrap.querySelector('[data-tree-feature]');
      if (!select || select.disabled) {
        return;
      }
      event.preventDefault();
      select.focus();
      if (typeof select.showPicker === 'function') {
        try {
          select.showPicker();
          return;
        } catch (err) {
          // fall through
        }
      }
      select.click();
    });

    this.host.addEventListener('change', function(event) {
      var target = event.target;
      if (target.matches('[data-tree-feature], [data-tree-city]')) {
        if (target.matches('[data-tree-city]')) {
          syncCityDisplay(target);
        }
        self.readFromDom();
        self.clearIncompleteHighlights();
        self.notifyChange();
      }
      if (target.matches('[data-tree-threshold]')) {
        self.readFromDom();
        self.syncThresholdMirrors(target);
        self.clearIncompleteHighlights();
        self.notifyChange();
      }
    });

    this.host.addEventListener('input', function(event) {
      var target = event.target;
      if (!target.matches('[data-tree-threshold]')) {
        return;
      }
      self.readFromDom();
      self.syncThresholdMirrors(target);
      self.clearIncompleteHighlights();
      self.notifyChange();
    });
  };

  SessionTree.prototype.toGameTree = function() {
    this.readFromDom();
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
        factors[path === '' ? '_' : path] = node.feature;
      }
      if (node.threshold !== '' && node.threshold !== undefined && node.threshold !== null) {
        boundaries[path === '' ? 'a' : path + 'a'] = String(node.threshold);
      }
      walk(path + 'l', node.left);
      walk(path + 'r', node.right);
    }

    walk('', this.root);
    return { factors: factors, boundaries: boundaries, predictions: predictions };
  };

  SessionTree.prototype.fromGameTree = function(tree) {
    function prediction(path) {
      var node = tree && tree.predictions && tree.predictions[path];
      if (!node) {
        return '';
      }
      return typeof node === 'string' ? node : (node.prediction || '');
    }

    function factor(path) {
      var key = path === '' ? '_' : path;
      return tree && tree.factors && tree.factors[key] ? tree.factors[key] : '';
    }

    function boundary(path) {
      var key = path === '' ? 'a' : path + 'a';
      var value = tree && tree.boundaries && tree.boundaries[key];
      return value === undefined || value === null ? '' : String(value);
    }

    function build(path, depth) {
      var feat = factor(path);
      if (feat && depth <= MAX_DEPTH) {
        return split(feat, boundary(path), build(path + 'l', depth + 1), build(path + 'r', depth + 1));
      }
      var city = prediction(path);
      return leaf(city, !city);
    }

    this.root = build('', 0);
    if (this.root.mode !== 'split') {
      this.root = emptyRoot();
    }
    this.render();
  };

  SessionTree.prototype.fromUiRoot = function(uiRoot) {
    function convert(node) {
      if (!node || node.mode === 'leaf') {
        var city = node && node.city ? node.city : '';
        return leaf(city, !city);
      }
      return split(node.feature, node.threshold, convert(node.left), convert(node.right));
    }
    this.root = convert(uiRoot);
    if (this.root.mode !== 'split') {
      this.root = emptyRoot();
    }
    this.render();
  };

  SessionTree.validateGameTree = function(tree) {
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
  };

  SessionTree.prototype.showAllLeafCards = function() {
    var changed = false;
    function walk(node) {
      if (!node) {
        return;
      }
      if (node.mode === 'leaf') {
        if (node.hideCards) {
          node.hideCards = false;
          changed = true;
        }
        return;
      }
      if (node.mode === 'split') {
        walk(node.left);
        walk(node.right);
      }
    }
    this.readFromDom();
    walk(this.root);
    if (changed) {
      this.render();
    }
  };

  SessionTree.prototype.clearIncompleteHighlights = function() {
    if (!this.host) {
      return;
    }
    this.host.querySelectorAll('.flow-incomplete-feature, .flow-incomplete-threshold').forEach(function(el) {
      el.classList.remove('flow-incomplete-feature', 'flow-incomplete-threshold');
    });
  };

  SessionTree.prototype.findIncompleteSplits = function() {
    this.readFromDom();
    var incomplete = [];
    function walk(path, node) {
      if (!node || node.mode !== 'split') {
        return;
      }
      var missingFeature = !node.feature;
      var missingThreshold = node.threshold === '' || node.threshold === undefined || node.threshold === null;
      if (missingFeature || missingThreshold) {
        incomplete.push({
          path: path,
          missingFeature: missingFeature,
          missingThreshold: missingThreshold
        });
      }
      walk(path + 'l', node.left);
      walk(path + 'r', node.right);
    }
    walk('', this.root);
    return incomplete;
  };

  SessionTree.prototype.highlightIncompleteSplits = function(incomplete) {
    var self = this;
    this.clearIncompleteHighlights();
    (incomplete || []).forEach(function(item) {
      var path = item.path || '';
      var decision = self.host.querySelector('.flow-decision[data-path="' + path + '"]');
      if (!decision) {
        return;
      }
      if (item.missingFeature) {
        decision.classList.add('flow-incomplete-feature');
        var featureField = decision.querySelector('.flow-field--feature');
        if (featureField) {
          featureField.classList.add('flow-incomplete-feature');
        }
      }
      if (item.missingThreshold) {
        decision.querySelectorAll('.flow-edge-threshold').forEach(function(label) {
          label.classList.add('flow-incomplete-threshold');
        });
      }
    });
  };

  SessionTree.prototype.validateSplitsForRun = function() {
    var incomplete = this.findIncompleteSplits();
    this.highlightIncompleteSplits(incomplete);
    if (!incomplete.length) {
      return true;
    }
    alert('Some branches are incomplete. Set a feature and threshold on the highlighted splits, or remove those branches.');
    var first = this.host.querySelector('.flow-incomplete-feature, .flow-incomplete-threshold');
    if (first && typeof first.scrollIntoView === 'function') {
      first.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
    }
    return false;
  };

  global.SessionTree = SessionTree;
})(typeof window !== 'undefined' ? window : global);
