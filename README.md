# Madison campus rentals map

A map of rentals within two miles of the UW–Madison campus: 605 properties, 2,988 units or floor plans and 67 landlords, collected on 2026-10-01. Listings come straight from landlord websites and the UW Off-Campus Housing service, and every value on the map says where it came from.

**[Open the map](https://webgrs.github.io/madison-rentals/)**

![Map of rentals near the UW–Madison campus](docs/map.png)

## What you can do

- Filter by bedrooms, a price range (per person or for the whole unit), lease year, distance from a campus landmark or from one of your own places, and by heat or all utilities included, internet, cats, dogs, in-unit laundry, parking, furniture, air conditioning or landlord.
- Leave out shared rooms, where two people split one bedroom. This is on by default, so a price means one person with their own bedroom.
- Sort by distance, nearest bus stop, distance to your places, price (low to high or high to low), price per square foot, unit size, earliest move-in, number of units to choose from, or fewest missing details. Each listing shows the value it was sorted by.
- Open a property to see every unit with its rent, size and move-in date, floor plan drawings where the landlord publishes them (44 properties), up to three nearby Madison Metro stops with their routes, photos, and anything still unknown.
- Save the places you go often by searching an address, clicking the map or using your phone's location. Every rental then shows its straight-line distance to each place, and opening one draws a dashed line to each.
- Zoom in to street level to see 305 Madison Metro bus stops.
- Switch between English and Chinese, light and dark, and a color, gray or satellite map.

![Property detail with floor plans, bus stops and distances to saved places](docs/detail.png)

<p><img src="docs/phone-map.png" alt="Map on a phone" width="300"> <img src="docs/phone-list.png" alt="List on a phone" width="300"></p>

## How prices are labeled

Landlords quote rent either per person or for the whole unit, and listings often do not say which. Each price on the map is marked one or the other, with the reason: the listing's own wording, the landlord's written policy, the label on the UW listing, or the building's other prices. When none of those settles it, the price is read whichever way puts one person between $800 and $1,500 a month, and the question goes on the landlord's list under *Missing info*. A per-person figure shown with ≈ is whole-unit rent divided by bedrooms.

## Missing info

The *Missing info* tab lists, landlord by landlord, what a renter needs but no source states, such as pet policy, included utilities, 2027–28 pricing or air conditioning, with the questions to ask and an email draft ready to copy.

![Missing info tab with questions and an email draft](docs/missing-info.png)

## Sources and privacy

- Listings: landlord websites and the UW Off-Campus Housing service, collected on 2026-10-01. Individual landlords who appear only on the UW list have their phone and email left out here; those properties link to the UW listing instead.
- Bus stops and routes: Madison Metro Transit's GTFS feed.
- Map: Leaflet, with tiles from Esri and map data © OpenStreetMap contributors.
- The page sends anonymous usage counts (which properties are opened, which filters and search words are used) so it can be improved. They contain no names, IP addresses or locations, and no cookies are set; the browser keeps only a random ID.
- Your saved places stay in your own browser. Searching for an address sends what you type to OpenStreetMap's Nominatim service.

Prices and availability change quickly. Treat this as a starting point and confirm details with the landlord before you sign anything.
