const Vue = require( 'vue' );
const PublishFollowUp = require( './PublishFollowUp.vue' );
const connectWikidata = require( './connectWikidata.js' );

connectWikidata();

const panel = document.createElement( 'div' );
document.body.appendChild( panel );
Vue.createMwApp( PublishFollowUp ).mount( panel );
