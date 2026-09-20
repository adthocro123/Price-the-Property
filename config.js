/* =========================================================================
   PRICE THE PROPERTY — browser configuration
   -------------------------------------------------------------------------
   This is the ONE file you edit to switch on real street views.

   Paste a Google Maps browser key between the quotes below, commit, push.
   Leave it empty and the game keeps working exactly as before, showing the
   free USGS aerial photo of each home instead.

   IS IT SAFE TO COMMIT A KEY HERE?  Yes — but only if you restrict it
   first. This file is served to every player, so the key is public by
   design (that's true of every Google Maps key used in a browser; there is
   no way around it on a static site). What stops someone reusing it is an
   HTTP-referrer restriction: Google will reject the key unless the request
   comes from your own site. README step 3 walks through setting that up,
   plus a hard daily cap so the bill cannot move off $0.

   DO NOT paste your RentCast key or a server key here. Those stay in GitHub
   Actions secrets, where players never see them.
   ========================================================================= */

window.PTP_CONFIG = {
  // Google Maps *browser* key, restricted to your site's referrer.
  // Example: "AIzaSyD-EXAMPLE-EXAMPLE-EXAMPLE-EXAMPLE"
  googleMapsBrowserKey: "",

  // How street views are shown:
  //   "interactive" — a real drag-to-look-around panorama (Maps Embed API,
  //                   free and unlimited, no per-request charge)
  //   "photo"       — a flat photo pointed at the house (Street View Static
  //                   API, 10,000 free/month, then billed per request)
  //   "off"         — ignore street views entirely, always use aerial
  streetViewMode: "interactive",

  // Let players flip between the street view and the aerial shot mid-round.
  // Handy when a tree is parked in front of the house.
  allowViewToggle: true
};
