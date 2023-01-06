
Sortable.create(area, {
  group: 'cards',
  sort: true,
  animation: 150
})

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