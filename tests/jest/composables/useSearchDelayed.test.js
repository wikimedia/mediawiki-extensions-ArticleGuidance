'use strict';

const mockVue = require( 'vue' );
const { ref, nextTick } = mockVue;
const { mount } = require( '@vue/test-utils' );

// Mock useSearch to control loading state and prevent actual API calls
const mockLoading = ref( false );
jest.mock(
	'../../../resources/ext.articleguidance.newarticle/composables/useSearch.js',
	() => ( {
		useSearch: () => ( {
			loading: mockLoading,
			results: mockVue.ref( [] ),
			error: mockVue.ref( null )
		} )
	} )
);

const useSearchDelayed = require( '../../../resources/ext.articleguidance.newarticle/composables/useSearchDelayed.js' );

describe( 'useSearchDelayed', () => {
	beforeEach( () => {
		jest.useFakeTimers();
		mockLoading.value = false;
	} );

	afterEach( () => {
		jest.useRealTimers();
	} );

	const TestComponent = {
		props: [ 'query', 'language' ],
		setup( props ) {
			const { isDelayed, loading } = useSearchDelayed( props.query, props.language, 1000 );
			return { isDelayed, loading };
		},
		template: '<div>isDelayed: {{ isDelayed }}, loading: {{ loading }}</div>'
	};

	it( 'defaults isDelayed to false', () => {
		const query = ref( '' );
		const language = ref( 'en' );
		const wrapper = mount( TestComponent, {
			props: { query, language }
		} );

		expect( wrapper.vm.isDelayed ).toBe( false );
	} );

	it( 'starts timer and sets isDelayed to true after delay when loading', async () => {
		const query = ref( '' );
		const language = ref( 'en' );
		const wrapper = mount( TestComponent, {
			props: { query, language }
		} );

		// Simulate user typing
		query.value = 'test';
		await nextTick();

		// Simulate search starting
		mockLoading.value = true;
		await nextTick();

		// Advance timer but not fully
		jest.advanceTimersByTime( 500 );
		expect( wrapper.vm.isDelayed ).toBe( false );

		// Advance timer past the threshold
		jest.advanceTimersByTime( 600 );
		expect( wrapper.vm.isDelayed ).toBe( true );
	} );

	it( 'resets isDelayed and clears timer if loading finishes early', async () => {
		const query = ref( '' );
		const language = ref( 'en' );
		const wrapper = mount( TestComponent, {
			props: { query, language }
		} );

		query.value = 'test';
		await nextTick();

		mockLoading.value = true;
		await nextTick();

		jest.advanceTimersByTime( 500 );
		expect( wrapper.vm.isDelayed ).toBe( false );

		// Simulate loading finishes before delay
		mockLoading.value = false;
		await nextTick();

		jest.advanceTimersByTime( 600 );
		expect( wrapper.vm.isDelayed ).toBe( false );
	} );

	it( 'clears timer and resets when query changes', async () => {
		const query = ref( '' );
		const language = ref( 'en' );
		const wrapper = mount( TestComponent, {
			props: { query, language }
		} );

		query.value = 'test';
		await nextTick();

		mockLoading.value = true;
		await nextTick();

		jest.advanceTimersByTime( 1100 );
		expect( wrapper.vm.isDelayed ).toBe( true );

		// Simulate typing new query
		query.value = 'new query';
		await nextTick();

		expect( wrapper.vm.isDelayed ).toBe( false );
	} );
} );
