/*!
 * wordcloud2.js
 * http://timdream.org/wordcloud2.js/
 *
 * Copyright 2011 - 2019 Tim Guan-tin Chien and contributors.
 * Released under the MIT license.
 */

'use strict';

// setImmediate
if (!window.setImmediate) {
  window.setImmediate = (function setupSetImmediate() {
    return window.msSetImmediate ||
    window.webkitSetImmediate ||
    window.mozSetImmediate ||
    window.oSetImmediate ||
    (function setupSetZeroTimeout() {
      if (!window.postMessage || !window.addEventListener) {
        return null;
      }

      var callbacks = [undefined];
      var message = 'zero-timeout-message';

      var handleMessage = function handleMessage(evt) {
        if (evt.source === window && evt.data === message) {
          evt.stopPropagation();
          if (callbacks.length > 0) {
            var fn = callbacks.shift();
            fn();
          }
        }
      };

      window.addEventListener('message', handleMessage, true);

      return function setZeroTimeout(fn) {
        callbacks.push(fn);
        window.postMessage(message, '*');
      };
    })() ||
    function setImmediate(fn) {
      window.setTimeout(fn, 0);
    };
  })();
}

if (!window.clearImmediate) {
  window.clearImmediate = (function setupClearImmediate() {
    return window.msClearImmediate ||
    window.webkitClearImmediate ||
    window.mozClearImmediate ||
    window.oClearImmediate ||
    function clearImmediate(id) {
      window.clearTimeout(id);
    };
  })();
}

(function(global) {

  var WordCloud = function WordCloud(elements, options) {
    if (!Array.isArray(elements)) {
      elements = [elements];
    }

    elements.forEach(function(el, i) {
      if (typeof el === 'string') {
        elements[i] = document.getElementById(el);
        if (!elements[i]) {
          throw 'The element id specified is not found.';
        }
      } else if (!el.tagName && !el.appendChild) {
        throw 'You must pass valid HTML elements, or ID of the element.';
      }
    });

    var settings = {
      list: [],
      fontFamily: '"Trebuchet MS", "Heiti TC", "微軟正黑體", ' +
                  '"Arial Unicode MS", "Droid Fallback Sans", sans-serif',
      fontWeight: 'normal',
      color: 'random-dark',
      minSize: 0,
      weightFactor: 1,
      clearCanvas: true,
      backgroundColor: '#fff',
      gridSize: 8,
      drawOutOfBound: false,
      origin: null,
      drawMask: false,
      maskColor: 'rgba(255,0,0,0.3)',
      maskGapWidth: 0.3,
      wait: 0,
      theta: 0,
      minRotation: -Math.PI / 2,
      maxRotation: Math.PI / 2,
      rotationSteps: 0,
      shuffle: true,
      rotateRatio: 0.1,
      shape: 'circle',
      ellipticity: 0.65,
      classes: null,
      hover: null,
      click: null
    };

    if (options) {
      for (var key in options) {
        if (key in settings) {
          settings[key] = options[key];
        }
      }
    }
    
    if (typeof settings.weightFactor === 'function') {
      var weightFactor = settings.weightFactor;
    } else {
      var weightFactor = function(size) {
        return size * settings.weightFactor;
      };
    }
    
    if (typeof settings.color === 'function') {
      var color = settings.color;
    } else {
      var color = (function() {
        switch(settings.color) {
          case 'random-dark':
            return function() {
              return 'rgb(' +
                Math.floor(Math.random() * 128) + ',' +
                Math.floor(Math.random() * 128) + ',' +
                Math.floor(Math.random() * 128) + ')';
            }
          case 'random-light':
            return function() {
              return 'rgb(' +
                Math.floor(Math.random() * 128 + 128) + ',' +
                Math.floor(Math.random() * 128 + 128) + ',' +
                Math.floor(Math.random() * 128 + 128) + ')';
            }
          default:
            return function() { return settings.color; };
        }
      })();
    }

    var main = function(el) {
      var list = settings.list;
      var canvas, info;
      if (el.getContext) {
        canvas = el;
        info = {};
      } else {
        canvas = el.firstChild;
        if (!canvas || !canvas.getContext) {
          el.innerHTML = '';
          canvas = document.createElement('canvas');
          el.appendChild(canvas);
        }
        info = el.dataset;
      }
      
      var width = canvas.width;
      var height = canvas.height;

      if(info.width !== width.toString() || info.height !== height.toString()) {
        canvas.setAttribute('width', width);
        canvas.setAttribute('height', height);
      }

      var ctx = canvas.getContext('2d');
      var board = [];
      var maxWeight = -Infinity, minWeight = Infinity;
      for (var i = 0; i < list.length; i++) {
        if (list[i][1] > maxWeight) maxWeight = list[i][1];
        if (list[i][1] < minWeight) minWeight = list[i][1];
      }

      var mu = 1;
      if (maxWeight !== minWeight) {
        mu = 1 / (maxWeight - minWeight);
      }

      var getFontSize = function(weight) {
        return settings.minSize + (weightFactor(weight) - weightFactor(minWeight)) * mu;
      };

      if(settings.shuffle) {
        list = [].concat(list).sort(function() { return 0.5 - Math.random(); });
      }

      var that = this;
      var timer = {};
      var fns = {};
      var steps = [];
      var start = function() {
        var i = 0;
        var getNext = function() {
          if (i >= list.length) {
            if (timer.clear) {
              clearImmediate(timer.clear);
              timer.clear = undefined;
            }
            return;
          }
          timer.clear = setImmediate(function() {
            var p = steps[i];
            var word = list[p][0];
            var weight = list[p][1];
            var fontSize = getFontSize(weight);
            var fontFamily = settings.fontFamily;
            var fontWeight = settings.fontWeight;
            var classes = settings.classes;
            if (typeof classes === 'function') {
              classes = classes(word, weight, list[p], p);
            }
            
            var rotate, theta;
            if(settings.rotationSteps > 0) {
              var steps = Math.floor(Math.random() * settings.rotationSteps);
              theta = settings.minRotation + (settings.maxRotation - settings.minRotation) * steps / (settings.rotationSteps-1);
            } else {
              if (Math.random() < settings.rotateRatio) {
                theta = settings.minRotation + Math.random() * (settings.maxRotation - settings.minRotation);
              } else {
                theta = settings.theta;
              }
            }
            
            ctx.font = fontWeight + ' ' + fontSize.toString(10) + 'px ' + fontFamily;
            var dimension = ctx.measureText(word);
            var w = dimension.width;
            var h = Math.max(fontSize,
              (dimension.actualBoundingBoxAscent || 0) + (dimension.actualBoundingBoxDescent || 0));
            
            var r = Math.sqrt(w * w + h * h);
            var rw = w, rh = h;
            if (theta) {
              var sin = Math.sin(theta);
              var cos = Math.cos(theta);
              rw = w * Math.abs(cos) + h * Math.abs(sin);
              rh = w * Math.abs(sin) + h * Math.abs(cos);
            }

            var points = [];
            var occupied = function(x, y) {
              if (x > width || y > height || x < 0 || y < 0) return true;
              x = Math.floor(x / settings.gridSize);
              y = Math.floor(y / settings.gridSize);
              return board[x][y];
            };

            var spiral = (function() {
              switch (settings.shape) {
                case 'circle':
                default:
                  return function(t) {
                    return [Math.cos(t), Math.sin(t)];
                  };

                case 'cardioid':
                  return function(t) {
                    return [Math.cos(t) * (1 - Math.cos(t)),
                            Math.sin(t) * (1 - Math.cos(t))];
                  };

                case 'diamond':
                case 'square':
                  var s = Math.SQRT2;
                  return function(t) {
                    var theta = t / (Math.PI / 2);
                    var phi = Math.ceil(theta);
                    if (phi > 4) phi = 4;
                    var d = t - (phi - 1) * (Math.PI / 2);
                    switch (phi) {
                      case 1: return [Math.cos(d), Math.sin(d)];
                      case 2: return [-Math.sin(d), Math.cos(d)];
                      case 3: return [-Math.cos(d), -Math.sin(d)];
                      case 4: return [Math.sin(d), -Math.cos(d)];
                    }
                  };
                  
                case 'triangle-forward':
                  var s = Math.sqrt(3);
                  return function(t) {
                    var d = t / (Math.PI * 2 / 3);
                    var phi = Math.ceil(d);
                    if (phi > 3) phi = 3;
                    var theta = t - (phi - 1) * (Math.PI * 2 / 3);
                    switch (phi) {
                      case 1: return [Math.cos(theta), Math.sin(theta)];
                      case 2: return [Math.cos(theta + Math.PI * 2 / 3), Math.sin(theta + Math.PI * 2 / 3)];
                      case 3: return [Math.cos(theta + Math.PI * 4 / 3), Math.sin(theta + Math.PI * 4 / 3)];
                    }
                  }
                  
                case 'triangle':
                case 'triangle-upright':
                  return function(t) {
                    var d = t / (Math.PI / 2);
                    var phi = Math.ceil(d);
                    if (phi > 2) phi = 2;
                    var theta = t - (phi - 1) * (Math.PI / 2);
                    switch (phi) {
                      case 1: return [Math.cos(theta), Math.sin(theta)];
                      case 2: return [-Math.sin(theta), Math.cos(theta)];
                    }
                  }
                  
                case 'pentagon':
                  return function(t) {
                    var d = t / (Math.PI * 2 / 5);
                    var phi = Math.ceil(d);
                    if (phi > 5) phi = 5;
                    var theta = t - (phi - 1) * (Math.PI * 2 / 5);
                    return [Math.cos(theta), Math.sin(theta)];
                  }
                  
                case 'star':
                  var s = Math.sqrt(3);
                  return function(t) {
                    var d = t / (Math.PI * 2 / 3);
                    var phi = Math.ceil(d);
                    if (phi > 3) phi = 3;
                    var theta = t - (phi - 1) * (Math.PI * 2 / 3);
                    switch (phi) {
                      case 1: return [Math.cos(theta), Math.sin(theta)];
                      case 2: return [Math.cos(theta + Math.PI * 2 / 3), Math.sin(theta + Math.PI * 2 / 3)];
                      case 3: return [Math.cos(theta + Math.PI * 4 / 3), Math.sin(theta + Math.PI * 4 / 3)];
                    }
                  }
              }
            })();
            
            var t = 0;
            var max_t = Math.min(width, height) / 2;

            var tryToPut = function() {
              var xy = spiral(t);
              var x = Math.floor(width / 2 + xy[0] * t * settings.ellipticity);
              var y = Math.floor(height / 2 + xy[1] * t);
              
              var box = {
                x: x - rw / 2, y: y - rh / 2,
                w: rw, h: rh
              };
              
              var isOccupied = true;
              for (var i = Math.floor(box.x); i <= Math.floor(box.x + box.w); i++) {
                for (var j = Math.floor(box.y); j <= Math.floor(box.y + box.h); j++) {
                  if (occupied(i, j)) {
                    isOccupied = false;
                    break;
                  }
                }
                if (!isOccupied) break;
              }
              
              if(isOccupied) {
                ctx.save();
                ctx.translate(x, y);
                ctx.rotate(theta);
                ctx.fillStyle = ctx.strokeStyle = color(word, weight, list[p], p, that);
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(word, 0, 0);
                ctx.restore();

                var gx = Math.floor((box.x + box.w / 2) / settings.gridSize);
                var gy = Math.floor((box.y + box.h / 2) / settings.gridSize);
                var gw = Math.floor(box.w / settings.gridSize);
                var gh = Math.floor(box.h / settings.gridSize);

                for (var i = gx - gw; i < gx + gw; i++) {
                  for (var j = gy - gh; j < gy + gh; j++) {
                    board[i][j] = true;
                  }
                }

                if (settings.drawMask) {
                  ctx.beginPath();
                  ctx.rect(box.x, box.y, box.w, box.h);
                  ctx.fillStyle = settings.maskColor;
                  ctx.fill();
                }

                if (settings.hover || settings.click) {
                  var item = {
                    word: word,
                    weight: weight,
                    item: list[p],
                    index: p,
                    font: {
                      family: fontFamily,
                      weight: fontWeight,
                      size: fontSize,
                    },
                    color: ctx.fillStyle,
                    rotate: theta,
                    dimension: {
                      w: w, h: h,
                    },
                    box: box,
                  };
                  points.push(item);
                }
                return true;
              }
              return false;
            }
            
            while(t < max_t) {
              t += settings.gridSize;
              if (tryToPut()) {
                if (i >= list.length-1) {
                  if (settings.hover || settings.click) {
                    if (settings.hover) {
                      canvas.addEventListener('mousemove', function(evt) {
                        var mpos = {
                          x: evt.clientX - canvas.offsetLeft,
                          y: evt.clientY - canvas.offsetTop
                        };
                        var found;
                        for(var i=0; i<points.length; i++) {
                          var box = points[i].box;
                          if(mpos.x >= box.x && mpos.x < box.x + box.w &&
                             mpos.y >= box.y && mpos.y < box.y + box.h) {
                            found = points[i];
                            break;
                          }
                        }
                        settings.hover(found, mpos, evt);
                      });
                    }
                    if (settings.click) {
                      canvas.addEventListener('click', function(evt) {
                        var mpos = {
                          x: evt.clientX - canvas.offsetLeft,
                          y: evt.clientY - canvas.offsetTop
                        };
                        var found;
                        for(var i=0; i<points.length; i++) {
                          var box = points[i].box;
                          if(mpos.x >= box.x && mpos.x < box.x + box.w &&
                             mpos.y >= box.y && mpos.y < box.y + box.h) {
                            found = points[i];
                            break;
                          }
                        }
                        settings.click(found, mpos, evt);
                      });
                    }
                  }
                }
                break;
              }
            }
            i++;
            getNext();
          });
        };

        if (settings.clearCanvas) {
          ctx.fillStyle = settings.backgroundColor;
          ctx.clearRect(0, 0, width, height);
          ctx.fillRect(0, 0, width, height);
        }

        for (var i = 0; i < Math.ceil(width / settings.gridSize); i++) {
          board[i] = [];
        }

        for(var i=0; i<list.length; i++) {
          steps.push(i);
        }

        getNext();
      };
      
      start();
    };

    elements.forEach(main);
  };
  
  WordCloud.isSupported = (
    'setImmediate' in window &&
    'postMessage' in window &&
    'addEventListener' in window &&
    (function() {
      var canvas = document.createElement('canvas');
      if (!canvas || !canvas.getContext) {
        return false;
      }
      return (canvas.getContext('2d').fillText);
    })()
  );

  WordCloud.minFontSize = (function() {
    var minFontSize = Infinity;
    var ctx = document.createElement('canvas').getContext('2d');
    ctx.font = '1px sans-serif';
    var dim = ctx.measureText('m');
    if (dim.actualBoundingBoxAscent) {
      minFontSize = Math.max(dim.actualBoundingBoxAscent, dim.actualBoundingBoxDescent);
    }
    return minFontSize;
  })();

  if (typeof define === 'function' && define.amd) {
    define('wordcloud', [], function() { return WordCloud; });
  } else if (typeof module === 'object' && module.exports) {
    module.exports = WordCloud;
  } else {
    global.WordCloud = WordCloud;
  }
})(this);