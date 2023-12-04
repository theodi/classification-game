$('document').ready(function(){

    let area = $('#training-set');
    Sortable.create(area[0], {
        animation: 150,
        sort: true,
        group: 'cards'
    });

    let cardbox = $('.cardbox');
    $(cardbox).each(function (i,e) {
        Sortable.create(e, {
            animation: 150,
            group: 'cards'
        });
    })

    var cardboxThin = $('.cardbox-thin');
    $(cardboxThin).each(function (i,e) {
        Sortable.create(e, {
            animation: 150,
            group: 'cards'
        });
    })
});