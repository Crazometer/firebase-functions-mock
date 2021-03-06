var oldValues = {};

function getKey(pathIndexTriggered, pathIndex, snapshot) {
  if (pathIndexTriggered > pathIndex) {
    var parent = snapshot.ref;
    while (pathIndex < pathIndexTriggered) {
      parent = parent.parent;
      pathIndex++;
    }

    return parent.key;
  } else if (pathIndex === pathIndexTriggered) {
    return snapshot.key;
  } else {
    var child = snapshot.val();
    while (pathIndexTriggered < pathIndex - 1) {
      child = child[Object.keys(child)[0]];
      pathIndex--;
    }

    return Object.keys(child)[0];
  }
}

function createParams(pathDescription, pathIndexTriggered, snapshot) {
  return pathDescription.reduce(function(params, path, pathIndex) {
    if (path.isParam) {
      params[path.name] = getKey(pathIndexTriggered, pathIndex, snapshot);
    }

    return params;
  }, {});
}

function getPath(pathDescription, pathIndex, snapshot) {
  return pathDescription
    .reduce(function(currentPath, path, index) {
      if (path.isParam) {
        return currentPath.concat(getKey(pathIndex, index, snapshot));
      }

      return currentPath.concat(path.name);
    }, [])
    .join('/');
}

function createCallbackEvent(pathDescription, pathIndex, snapshot) {
  var previousValue = oldValues[getPath(pathDescription, pathIndex, snapshot)];

  oldValues[getPath(pathDescription, pathIndex, snapshot)] = snapshot.val();

  return {
    params: createParams(pathDescription, pathIndex, snapshot),
    data: Object.assign(snapshot, {
      exists() {
        return snapshot.val() !== null;
      },
      changed() {
        if (this.exists() && !this.previous.exists()) {
          return true;
        }
        if (
          Object.keys(
            snapshot.val().length !== Object.keys(this.previous.val()).length
          )
        ) {
          return true;
        }

        var newVal = snapshot.val();
        var oldVal = this.previous.val();
        if (
          Object.keys(newVal).reduce(function(hasChanged, valKey) {
            if (hasChanged) {
              return true;
            }

            return newVal[valKey] !== oldVal[valKey];
          }, false)
        ) {
          return true;
        }

        return false;
      },
      previous: {
        val() {
          return previousValue;
        },
        exists() {
          return previousValue !== undefined;
        },
      },
    }),
  };
}

function getValue(pathDescription, pathIndex, snapshot) {
  var child = snapshot.val();
  while (pathIndex < pathDescription.length - 1) {
    child = child[Object.keys(child)[0]];
    pathIndex++;
  }

  return child;
}

function createEvent(ref, pathDescription, pathIndex, cb) {
  var pathKey = pathDescription[pathIndex];
  var hasMorePathKeys = pathIndex < pathDescription.length - 1;

  var initialDataLoaded = false;
  ref.on('child_added', function(snapshot) {
    if (hasMorePathKeys) {
      createEvent(snapshot.ref, pathDescription, pathIndex + 1, cb);
    }

    if (initialDataLoaded && pathIndex === pathDescription.length - 1) {
      cb(createCallbackEvent(pathDescription, pathIndex, snapshot));
    }
  });
  ref.once('value', function(snapshot) {
    if (initialDataLoaded) {
      return;
    }
    initialDataLoaded = true;
    if (!hasMorePathKeys) {
      oldValues[getPath(pathDescription, pathIndex - 1, snapshot)] = getValue(
        pathDescription,
        pathIndex - 1,
        snapshot
      );
    }
  });

  if (!hasMorePathKeys) {
    ref.on('child_changed', function(snapshot) {
      cb(createCallbackEvent(pathDescription, pathIndex, snapshot));
    });
  }
}

function onWrite(path, cb, admin) {
  var pathDescription = path
    .split('/')
    .filter(str => str !== '')
    .reduce(function(currentPathDescription, pathKey) {
      var paramMatch = pathKey.match(/\{(.*)\}/);
      var isParam = Boolean(paramMatch);

      return currentPathDescription.concat({
        isParam,
        name: isParam ? paramMatch[1] : pathKey,
      });
    }, []);

  var ref = admin.database().ref(pathDescription[0].name);

  createEvent(ref, pathDescription, 1, cb);
}

module.exports = onWrite;
