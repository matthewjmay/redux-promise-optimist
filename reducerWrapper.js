export const BEGIN = "BEGIN";
export const COMMIT = "COMMIT";
export const REVERT = "REVERT";
const INITIAL_OPTIMIST = [];

// utility to split state into our optimist section and the original state
const separateState = state => {
  if (typeof state !== "object" || state === null) {
    // we can't destructure
    return { optimist: INITIAL_OPTIMIST, innerState: state };
  }
  const { optimist = INITIAL_OPTIMIST, ...innerState } = state;
  return { optimist, innerState };
};

const isMatchingTransaction = (action, id) =>
  action.optimist && action.optimist.id === id;

export default originalReducer => {
  const baseReducer = (optimist, innerState, action) => {
    // record the action if we have started 'recording' with beginReducer
    if (optimist.length > 0) {
      // concat for immutability
      optimist = optimist.concat([{ recordedAction: action }]);
    }
    innerState = originalReducer(innerState, action);
    return { optimist, ...innerState };
  };

  const beginReducer = (state, action) => {
    let { optimist, innerState } = separateState(state);
    optimist = optimist.concat([
      { stateBeforeAction: innerState, recordedAction: action }
    ]);
    innerState = originalReducer(innerState, action);
    return { optimist, ...innerState };
  };

  const commitReducer = (state, action) => {
    const { optimist, innerState } = separateState(state);
    const newOptimist = [];
    let shouldRecord = false;

    optimist.forEach(({ stateBeforeAction, recordedAction }) => {
      if (
        shouldRecord &&
        isMatchingTransaction(recordedAction, action.optimist.id)
      ) {
        // we don't need to remember the state before this action anymore
        stateBeforeAction = null;
      } else if (
        stateBeforeAction &&
        !isMatchingTransaction(recordedAction, action.optimist.id)
      ) {
        // we have an original state that may be needed for another revert so start 'recording'
        shouldRecord = true;
      }

      if (shouldRecord) {
        // note: stateBeforeAction may still be falsy here
        newOptimist.push({ stateBeforeAction, recordedAction });
      }
    });

    return baseReducer(newOptimist, innerState, action);
  };

  const revertReducer = (state, action) => {
    const { optimist } = separateState(state);
    const newOptimist = [];
    let shouldRecord = false;
    let currentStateAfterRevert;
    optimist.forEach(({ stateBeforeAction, recordedAction }) => {
      if (isMatchingTransaction(recordedAction, action.optimist.id)) {
        currentStateAfterRevert = stateBeforeAction;
      } else {
        if (stateBeforeAction) {
          shouldRecord = true;
        }
        if (shouldRecord) {
          if (currentStateAfterRevert && stateBeforeAction) {
            // overwrite stateBeforeAction with the new state (with reverted action)
            newOptimist.push({
              stateBeforeAction: currentStateAfterRevert,
              recordedAction
            });
          } else {
            // note stateBeforeAction could be undefined here
            newOptimist.push({
              stateBeforeAction,
              recordedAction
            });
          }
        }
        // 'replay' actions after we have reverted state
        if (currentStateAfterRevert) {
          currentStateAfterRevert = originalReducer(
            currentStateAfterRevert,
            recordedAction
          );
        }
      }
    });

    return baseReducer(newOptimist, currentStateAfterRevert, action);
  };

  return (state, action) => {
    if (action.optimist) {
      switch (action.optimist.type) {
        case BEGIN:
          return beginReducer(state, action);
        case COMMIT:
          return commitReducer(state, action);
        case REVERT:
          return revertReducer(state, action);
      }
    }

    const { optimist, innerState } = separateState(state);
    return baseReducer(optimist, innerState, action);
  };
};
