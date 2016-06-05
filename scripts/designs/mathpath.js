/*!
 * WHALE – large prints for empty walls
 * https://whale.ee
 *
 * Copyright (c) 2014–2016 Daniel Stutz Grafik (super@asdf.af) and Bruce A. MacNaughton. All rights reserved.
 * You may use this code only to develop designs for the WHALE website(s).
 */


//
// mathpath.js
//
// 2016-04-06 - Adrian le Bas
//

var rad = 57.2958;
var angleInitial = 0.5;
var angleIncrement = 0.5;
var radiusInitial = 0.5;
var radiusIncremental = 0.5;
var pointsInitial = 108;
var shouldSmooth = false;
var strokeDivisor = 400;

var Design = (function(d) {
    d = function(f) {
        //
        // standard (framework-required) properties that must be set by all designs
        // this.f (back reference to the framework instance)
        // this.name (the name of the design)
        // this.orientation (the orientation of the design - portrait or landscape)
        //
        this.f = f;                         // the framework instance the design is part of
        this.mode = null;                   // keep track of the mode here


        // set all values to initial. note that setInitialValues doesn't reset the
        // orientation - that's considered separate from the design itself.
        this.orientation = d.orientation;
        this.setInitialValues();

    }

    //
    // Design-specific constants are defined here. These are constants that are required to
    // create, modify, or reset the design. The framework does not require that constants are
    // defined in this way but it is a good practice.
    //

    //
    // First are properties required by the framework. if a design is created without
    // properties corresponding to these (e.g., this.orientation) or those properties
    // are not initialized to valid values an exception will be thrown.
    //
    // note: d.name cannot be used because it conflicts with the function property 'name'
    // so we use d.designName instead.
    //
    d.designName = 'skeleton';
    d.orientation = 'landscape';

    //
    // constants for your design go here.
    //

    d.angle = 0.4812919945299557;// Math.PI + (Math.PI * 0.1); //54.99529840000005; //10.46600010001009;
    d.radius = rad;
    d.points = pointsInitial; // 292;
    d.hue = 183.97030302408461;
    d.brightness = 0.7457950674765723;
    d.strokeDivisor = strokeDivisor;
    d.color = new paper.Color({
        hue: d.hue,
        saturation: 1.0,
        brightness: d.brightness
    });

    //
    // editing modes. the names must be one a valid mode name. see
    // framework#validModeNames for a list. setMode will be called with
    // two parameters: this index of the mode being set and the name of
    // the mode being set.
    //
    // values other than "mode0" and "mode1" need to be supplied.
    //

    d.mode0 = 'Draw';
    d.mode1 = 'Spread';
    d.mode2 = 'Twist';
    d.mode3 = 'AddPoints';
    d.mode4 = 'Style';

    d.modes = [d.mode0, d.mode1, d.mode2, d.mode3, d.mode4];

    //
    // the design reset function. it is a good practice to consolidate setting of all
    // properties in this single method to make sure all properties are correctly set
    // when initializing and resetting the design (and in the future, saving and
    // restoring the state of the design).
    //
    d.prototype.setInitialValues = function() {
        this.name = d.designName;
        this.brightness = d.brightness;
        this.angle = d.angle;
        this.color = d.color;
        this.hue = d.hue;
        this.radius = d.radius;
        this.points = d.points;
        this.paths = [];
        window.bob = this;
    }

    return d;

})({});

//
// the Design drawing functions.
//
Design = (function(d) {

    d.prototype.drawInitialDesign = function() {
        this.setInitialValues();
        this.updateDesign();
    }

    d.prototype.updateDesign = function() {
        paper.project.activeLayer.removeChildren();

        // set color
        this.color.hue = this.hue;
        this.color.brightness = this.brightness;

        var finalSegments = [];
        var finalPaths = [];
        // // create path


        if (this.paths.length) {
            for (var pathIndex = this.paths.length - 1; pathIndex >= 0; pathIndex--) {

                var thisFinalPathSegments = [];
                var segments = this.paths[pathIndex].segments;
                var rounded = segments.length * Math.round(this.points / segments.length);

                // set each point coords and add to path
                for (var i = rounded; i >= 0; i--) {
                    var point = segments[i % segments.length].point;
                    var x = point.x + Math.cos(this.angle * i) * this.radius;
                    var y = point.y + Math.sin(this.angle * i) * this.radius;
                    thisFinalPathSegments.push([x, y]);
                }

                var finalPath = new paper.Path({
                    segments: thisFinalPathSegments,
                    strokeColor: this.color,
                    strokeWidth: this.getStrokeWidth(),
                    closed: false,
                    strokeCap: 'round',
                    selected: false
                });

                finalPaths.push(finalPath);
            }
        }

        if (shouldSmooth) {
            finalPath.smooth();
        }
    };

    //
    // strokewidth varies with canvas size
    //
    d.prototype.getStrokeWidth = function() {
        var strokeDim = this.orientation === "portrait" ? "width" : "height";
        return paper.view.size[strokeDim] / d.strokeDivisor;
    }

    return d;

})(Design);

//
// this section defines functions used for handling mouse events. they are called from paper's Tool event
// handlers so event is a paper Toolevent, not a document mouse event. 'this' is equal to the design.
//
// if they return true the framework will cause paper to redraw the view.
//
// the closure around these functions is often useful for local variables and functions associated with
// handling mouse events.
//
Design = (function(d) {

    var baseBrightness;

    d.prototype.mouseDown = function(event) {
        switch (this.mode) {
          case 'Draw':
            this.handleDownPlot(event);
            break;
          case 'Style':
            baseBrightness = this.brightness;
            break;
          case 'Twist':
            break;
          case 'Spread':
            break;
          case 'AddPoints':
            break;
          default:
            throw "invalid mode: " + this.mode;
        }

        return false;
    };

    d.prototype.mouseDrag = function(event) {
        switch (this.mode) {
          case 'Draw':
            this.handleDragPlot(event);
            break;
          case 'Style':
            this.handleDragStyle(event);
            break;
          case 'Spread':
            this.handleDragSpread(event);
            break;
          case 'Twist':
            this.handleDragTwist(event);
            break;
          case 'AddPoints':
            this.handleDragAddPoints(event);
            break;
          default:
            throw "invalid mode: " + this.mode;
        }

        return true;
    };

    d.prototype.mouseUp = function(event) {
        switch (this.mode) {
          case 'Draw':
            this.handleUpPlot(event);
            return true;
            break;
          case 'Style':
            break;
          case 'Twist':
            break;
          case 'Spread':
            break;
          case 'AddPoints':
            break;
          default:
            throw "invalid mode: " + this.mode;
        }

        return false;
    };

    d.prototype.handleDragStyle = function(event) {
        this.hue += event.delta.x / paper.view.viewSize.width * 360;
        var mod = this.hue % 360;
        this.hue = mod > 0 ? mod : 360 - mod;
        var delta = event.downPoint.y - event.point.y;

        if (delta > 0) {
            this.brightness = baseBrightness + (1.0 - baseBrightness) * delta / event.downPoint.y;
        } else {
            this.brightness = baseBrightness + delta / (paper.view.viewSize.height - event.downPoint.y);
        }

        this.brightness = Math.min(1.0, Math.max(0.0, this.brightness));
        this.updateDesign();
    };

    d.prototype.handleDragSpread = function(event) {
        var y = event.delta.y;
        this.radius += (y * Math.PI);
        this.updateDesign();
    };

    d.prototype.handleDownPlot = function(event) {
        // Create a new path and set its stroke color to black:
        var path = new paper.Path({
            segments: [event.point],
            strokeColor: this.color,
            // Select the path, so we can see its segment points:
            fullySelected: true
        });

        this.paths.unshift(path);
    };

    d.prototype.handleDragPlot = function(event) {
        this.paths[0].add(event.point);
    };

    d.prototype.handleUpPlot = function(event) {
        this.paths[0].simplify(10);
        this.updateDesign();
    };

    d.prototype.handleDragTwist = function(event) {
        var y = event.delta.y;

        this.angle += (y * Math.PI) * 0.0001;
        this.updateDesign();
    };

    d.prototype.handleDragAddPoints = function(event) {
        var y = event.delta.y;
        this.points -= y;

        if (this.points >= 500) this.points = 500;
        if (this.points <= 5) this.points = 5;

        this.updateDesign();

    }

    return d;

})(Design);

Design = (function(d) {
    //
    // Return the array of mode names
    //
    d.prototype.getModes = function() {
        return d.modes
    }

    //
    // Set the edit mode to mode. mode is numeric and ranges from 0 to
    // the number of modes returned by getModeCount - 1. modeName is a
    // string of the name for the same mode. i find it is more readable
    // to work with the string name than the index.
    //
    // it is possible to change the mouse event handling functions here
    //so that they don't need to check mode when called, i.e., set
    // this.mouseDrag to a mode-specific function. If so, make sure you
    // reset it in the setInitialValues function.
    //
    d.prototype.setMode = function(mode, modeName) {
        this.mode = modeName;
    };

    //
    // Change the orientation of this design. the value of orientation will be
    // either 'portrait' or 'landscape'.
    //
    d.prototype.setOrientation = function(orientation) {
        if (this.orientation != orientation) {
            this.orientation = orientation;
        }
    }
    return d;
})(Design);

//
// these functions are optional. if these properties exist they must refer to functions.
// they are called if generating SVG requires special pre- and/or post-processing.
//
Design = (function(d) {
    d.prototype.preprocessForSVG = function() {
        return;
    }
    d.prototype.postprocessForSVG = function() {
        return;
    }
    return d;
})(Design);
