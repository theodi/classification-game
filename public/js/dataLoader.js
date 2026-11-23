function fetchPack(callback) {
    fetch('/config/features.json')
        .then(function(response) { return response.json(); })
        .then(function(config) {
            window.GAME_FEATURES = config.features;
            if (typeof initChartFeatures === 'function') {
                initChartFeatures(config.features);
            }
            return fetch('/data/pack.json');
        })
        .then(function(response) { return response.json(); })
        .then(function(pack) {
            callback(pack.cards.map(function(card) {
                card.index = card.id;
                return card;
            }));
        });
}

function filterPack(cards, queryParamArray) {
    const wanted = {};
    queryParamArray.forEach(function(id) { wanted[String(id)] = true; });
    return cards.filter(function(card) { return wanted[String(card.index)]; });
}
