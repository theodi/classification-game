function refreshCardboxes() {
  ['training-set', 'test-set', 'evaluation-set'].forEach(function(id) {
    var tray = document.getElementById(id);
    if (tray && !tray._sortable) {
      tray._sortable = Sortable.create(tray, {
        animation: 150,
        sort: true,
        group: 'cards',
        draggable: 'card',
        filter: '.game-deck-actions, .game-deck-actions *, .game-deck-hover, .game-run-summary, .game-run-summary *',
        preventOnFilter: false
      });
    }
  });

  document.querySelectorAll('.cardbox, .cardbox-thin, [data-tree-dropzone]').forEach(function(el) {
    if (el._sortable) {
      return;
    }
    el._sortable = Sortable.create(el, {
      animation: 150,
      group: 'cards',
      draggable: 'card',
      filter: '.game-leaf-hover',
      preventOnFilter: false,
      onAdd: function(evt) {
        syncCardBoxFromElement(evt.item, el);
      }
    });
  });
}

function syncCardBoxFromElement(cardEl, boxEl) {
  if (!cardEl || !boxEl || typeof cards === 'undefined' || !cards.trainingSet) {
    return;
  }
  var match = (cardEl.id || '').match(/^b(\d+)$/);
  var path = boxEl.getAttribute('data-path') || '';
  if (!match) {
    return;
  }
  var index = parseInt(match[1], 10);
  cards.trainingSet.forEach(function(card) {
    if (card.index === index) {
      card.box = path;
    }
  });
}

$('document').ready(function() {
  refreshCardboxes();
});
