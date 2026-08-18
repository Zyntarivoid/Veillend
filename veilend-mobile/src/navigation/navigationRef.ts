// Lightweight delegating navigation ref used across the app.
// We intentionally avoid importing `@react-navigation/native` here so
// unit tests can import this module without pulling react-native
// transforms. The real NavigationContainer will call `setNativeRef()`
// to attach the real ref when mounted in the running app.

type NavRoute = { name: string } | null;

const _delegate: {
	_nativeRef: any;
	_mockRoute: NavRoute;
	isReady: () => boolean;
	reset: (state: { index: number; routes: { name: string }[] }) => void;
	getCurrentRoute: () => NavRoute;
} = {
	_nativeRef: null,
	_mockRoute: null,
	isReady() {
		return Boolean(this._nativeRef && typeof this._nativeRef.reset === 'function');
	},
	reset(state: { index: number; routes: { name: string }[] }) {
		if (this._nativeRef && typeof this._nativeRef.reset === 'function') {
			this._nativeRef.reset(state);
		} else {
			// Fallback for tests: store the first route as the current route.
			this._mockRoute = state.routes && state.routes.length ? { name: state.routes[0].name } : null;
		}
	},
	getCurrentRoute() {
		if (this._nativeRef && typeof this._nativeRef.getCurrentRoute === 'function') {
			return this._nativeRef.getCurrentRoute();
		}
		return this._mockRoute;
	},
};

export const navigationRef = {
	reset: (state: { index: number; routes: { name: string }[] }) => _delegate.reset(state),
	getCurrentRoute: () => _delegate.getCurrentRoute(),
	isReady: () => _delegate.isReady(),
};

export const setNativeRef = (ref: any) => {
	_delegate._nativeRef = ref;
};

export default navigationRef;
