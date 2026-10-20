/*
 * Accessible Visualisation Kit — thin React wrapper (no JSX, no build step).
 * Needs React 17+ and core/accessible-viz.js loaded first.
 *
 *   <AccessibleViz adapter={adapter} chat={engines} state={state} onReady={kit => …} />
 *
 * `state` is whatever your adapter functions read. When it changes the shell
 * updates in place, so focus, typed text and the open tab are kept.
 */
(function (global) {
  var React = global.React;
  var core = global.AccessibleViz;

  function AccessibleViz(props) {
    var rootRef = React.useRef(null);
    var kitRef = React.useRef(null);
    var stateRef = React.useRef(props.state);
    var adapterRef = React.useRef(props.adapter);
    stateRef.current = props.state;
    adapterRef.current = props.adapter;

    React.useEffect(function () {
      // getState always returns the latest prop, so nothing inside the kit
      // (voice input included) ever reads stale data.
      var adapter = Object.assign({}, adapterRef.current, {
        getState: function () { return stateRef.current; },
      });
      var kit = core.create({
        root: rootRef.current,
        adapter: adapter,
        chat: props.chat,
        voice: props.voice,
        listen: props.listen,
      });
      kitRef.current = kit;
      if (props.onReady) props.onReady(kit);
      return function () { kit.destroy(); kitRef.current = null; };
    }, []);

    React.useEffect(function () {
      if (kitRef.current) kitRef.current.update();
    }, [props.state]);

    return React.createElement("div", { ref: rootRef, className: props.className });
  }

  var api = { AccessibleViz: AccessibleViz };
  global.AccessibleVizReact = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : this);
