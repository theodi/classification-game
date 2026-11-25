(function(global) {
  var gameTree = null;
  var treeEditable = true;

  function liveTree() {
    if (gameTree) {
      return gameTree.toGameTree();
    }
    return { factors: {}, boundaries: {}, predictions: {} };
  }

  function syncGlobalPredictions(tree) {
    if (typeof predictions === 'undefined') {
      return;
    }
    var next = (tree && tree.predictions) || {};
    Object.keys(predictions).forEach(function(key) {
      if (!next[key]) {
        delete predictions[key];
      }
    });
    Object.keys(next).forEach(function(key) {
      predictions[key] = Object.assign({}, predictions[key] || {}, next[key]);
    });
  }

  function onTreeChange() {
    var tree = liveTree();
    syncGlobalPredictions(tree);
    if (typeof saveData === 'function') {
      saveData();
    }
    if (typeof cards !== 'undefined' && cards.trainingSet && typeof updateConfidence === 'function') {
      updateConfidence(cards.trainingSet);
    }
    if (typeof updateEvalActionButtons === 'function') {
      updateEvalActionButtons();
    }
  }

  function afterRender() {
    if (typeof refreshCardboxes === 'function') {
      refreshCardboxes();
    }
    if (typeof modelHasRun !== 'undefined' && modelHasRun &&
        typeof restoreCardsToBoxes === 'function' &&
        typeof cards !== 'undefined' && cards.trainingSet) {
      restoreCardsToBoxes(cards.trainingSet);
    }
    if (!treeEditable && gameTree) {
      gameTree.setEditable(false);
    }
  }

  function initGameTree(features) {
    gameTree = new SessionTree('#game-decision-tree', {
      mode: 'game',
      features: features || [],
      afterRender: afterRender,
      onChange: onTreeChange
    });
    global.gameTree = gameTree;
    return gameTree;
  }

  function loadStoredTree() {
    if (!gameTree || typeof sessionId === 'undefined') {
      return;
    }
    try {
      var raw = window.localStorage.getItem(sessionId);
      if (!raw) {
        gameTree.render();
        return;
      }
      var stored = JSON.parse(raw);
      if (stored && stored.factors) {
        gameTree.fromGameTree({
          factors: stored.factors || {},
          boundaries: stored.boundaries || {},
          predictions: stored.predictions || {}
        });
        syncGlobalPredictions(gameTree.toGameTree());
      } else {
        gameTree.render();
      }
    } catch (err) {
      gameTree.render();
    }
  }

  function setGameTreeEditable(editable) {
    treeEditable = !!editable;
    if (gameTree) {
      gameTree.setEditable(treeEditable);
    }
  }

  global.initGameTree = initGameTree;
  global.loadStoredTree = loadStoredTree;
  global.liveGameTree = liveTree;
  global.setGameTreeEditable = setGameTreeEditable;
})(typeof window !== 'undefined' ? window : global);
