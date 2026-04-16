const Vue = require( 'vue' );
const PublishFollowUp = require( './PublishFollowUp.vue' );
const panel = document.createElement( 'div' );
document.body.appendChild( panel );
Vue.createMwApp( PublishFollowUp ).mount( panel );
