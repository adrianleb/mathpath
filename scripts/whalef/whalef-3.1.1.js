/*
 * WHALE – large prints for empty walls
 * https://whale.ee
 *
 * Copyright (c) 2014–2016 Daniel Stutz Grafik (super@asdf.af) and Bruce A. MacNaughton. All rights reserved.
 * You may use this code only to develop designs for the WHALE website(s).
 */
var Framework = (function(f) {
    //
    // this function creates the framework object and the design object in the
    // framework
    //
    f = function(editableCanvas, snapshotImage) {
        // paper needs to be loaded
        if (typeof paper === "undefined") {
            throw "paper.js not correctly installed before invoking Design";
        }

        //
        // Set initial width and height here to get around paper bug where
        // designs with a gradient, i.e., mist, raise a DOMException when
        // resized and redrawn after the first drawing.
        //
        if (!editableCanvas.hasAttribute("width") || !editableCanvas.hasAttribute("height")) {
            editableCanvas.width = 300;
            editableCanvas.height = 300;
        }

        //
        // setup the drawing then resize to take into account the browser
        // dimensions (even though it's not visible right now).
        //
        this.p = paper;                 // save instance reference
        paper.setup(editableCanvas);            // setup paper
        this.tool = new paper.Tool();           // create the event tool
        this.dragged = false;                   // true if the mouse was dragged
        this.eCanvas = editableCanvas;
        this.snapshot = snapshotImage;
        this.design = new this.createDesign(this);

        // check some basic things about the design
        if (!this.design.f || this.design.f != this)
            throw "Missing or invalid property in design: f";

        if (!this.design.name || !this.design.orientation)
            throw "Missing required property in design: name or orientation";

        // make sure the orientation is valid
        if (this.design.orientation != 'portrait' && this.design.orientation != 'landscape')
            throw "Invalid design orientation: " + this.design.orientation;

        // make sure required functions exist and handle optional functions
        checkDesignFunctions(this.design);

        this.defaultDesignOrientation = this.design.orientation;
        this.orientation = this.design.orientation;
        this.snapdim = null;                    // set by the setSnapshotSize, called from resizeDisplayElements

        // mode and help logic
        this.helpActivated = false;

        // get the design's modes and check them.
        this.modes = this.design.getModes();
        this.setupModes(this.modes, f.mode);
        this.modeCount = this.modes.length;

        this.mode = f.mode;
        this.setMode(f.mode);         // set the default mode

        //
        // resize the display elements
        //
        this.initialResize();

        //
        // draw the initial design (as opposed to update it)
        //
        this.design.drawInitialDesign();

        // it's not visible but force a draw so the canvas can be copied to
        // the snapshot
        paper.view.update();

        // the snapshot canvas is only used as a destination for copying the
        // design from the editable canvas. it has no paper project associated
        // with it. this.statctx = this.sCanvas.getContext("2d");

        //
        // resize (the design might be a different orientation than how canvas
        // was set up), enable resizing, then copy the editable canvas to the
        // snapshot canvas.
        //
        this.copyEditableToSnapshot();
        this.enableResizing();
        this.setSnapshotVisibilityOn();

        // finally enable the mouse events for the editable design and the
        // control menu items
        this.enableMouseEvents();
        this.enableMenuClicks();
        this.enableUnloadHandler();

        // now it's OK to show the page
        this.showBody();

        // figure out the submit URL based on whether this is being run
        // locally or not
        this.submitURL = f.submitURL;
        if (document.URL.substring(0, 5) == "file:" || document.URL.substring(0, f.localServer.length) == f.localServer) {
            this.submitURL = f.localSubmitURL;
        }
    }

    // make sure that the design implements the required API
    function checkDesignFunctions(design) {
        var required = [
            "drawInitialDesign",
            "getModes",
            "setMode",
            "setOrientation",
            "updateDesign",
            "mouseDown",
            "mouseDrag",
            "mouseUp",
        ];

        var errors = 0;
        for(var i=0; i < required.length; i++) {
            if (typeof design[required[i]] != "function") {
                console.log("Missing function", required[i], "in design");
                errors++;
                }
        }
        if (errors != 0)
            throw "Aborting due to missing functions in design";

        //
        // optional functions
        //
        if (typeof design.preprocessForSVG === "undefined")
            design.preprocessForSVG = noop
        else if (typeof design.preprocessForSVG !== "function")
            throw "preprocessForSVG must reference a function";

        if (typeof design.postprocessForSVG === "undefined")
            design.postprocessForSVG = noop
        else if (typeof design.preprocessForSVG != "function")
            throw "preprocessForSVG must reference a function";

    }

    function noop() {};


    return f;
})(Framework || {});

//
// Framework global constants
//
Framework = (function(f) {
    f.localServer = "http://localhost";
    f.localSubmitURL = f.localServer + ":8091/cart";
    f.submitURL = "https://plankton.whale.ee/cart";
    // snapshot width when landscape, height when portrait
    f.snapLongDimension = 664;
    // ditto for PNG generation
    f.PNGLongDimension = 2000;
    f.ratio = 10/7;    // divide long dimension by ratio to get short dimension
    f.mode = 0;        // alternates between mode 0 and n-1

    //
    // crop mark generation information. all dimensions are in pixels.
    //
    f.trimWidth = 6;              // how much of the design to trim on each side (6)
    f.cropMarkLength = 30;        // length of the crop marks (30)
    f.cropMarkOffset = 20;        // space between the crop marks and the design (20)
    f.cropMarkTotal = f.cropMarkLength + f.cropMarkOffset;

    //
    // poster dimensions (longDimension, longDimension / ratio), i.e.,
    // horizontal orientation for S, M, and L sizes. the following sizes
    // are the final (cropped) design.
    //
    f.dimensions = {
        S: {w: 2834.65, h: 1984.26},
        M: {w: 3628.35, h: 2537.01},
        L: {w: 4818.9, h: 3373.23}
    }

    //* fix dimensions at perfect ratios, i.e., only the w property matters.
    f.dimensions.S.h = f.dimensions.S.w / f.ratio;
    f.dimensions.M.h = f.dimensions.M.w / f.ratio;
    f.dimensions.L.h = f.dimensions.L.w / f.ratio;
    // */

    // watermarked .png file dimensions
    f.pngDimensions = {
        landscape: {w: 1330, h: 931},
        portrait: {w: 931, h: 1330}
    }

    return f;
})(Framework);


//
// Snapshot functions
//
Framework = (function(f) {
    //
    // function to get the correct snapshot dimensions for the orientation
    //
    f.prototype.getSnapshotDimensions = function() {
        var w, h;
        if (this.orientation == 'landscape') {
            w = f.snapLongDimension;
            h = w / f.ratio;
        } else {
            h = f.snapLongDimension;
            w = h / f.ratio;
        }            
        return {w: w, h: h};
    }

    //
    // function to copy the editable canvas to the snapshot
    //
    f.prototype.copyEditableToSnapshot = function() {
        var pvSize = this.p.view.viewSize;
        
        // if not same orientation then it's a problem.
        if (this.snapdim.w > this.snapdim.h ^ pvSize.width > pvSize.height) {
            throw "Snapshot and canvas don't have the same orientation"
        }

        // get a PNG data URL of the editable canvas for the snapshot
        this.snapshot.src = this.toPNG(f.PNGLongDimension);

    }

    return f;

})(Framework);

//
// Make a watermarked canvas
//
Framework = (function(f) {

    f.prototype.makeWatermarkedCanvas = function(dimensions) {
        //
        // make a new canvas which is never inserted into the DOM
        //
        var canvas = document.createElement("canvas");
        canvas.width = dimensions.w;
        canvas.height = dimensions.h;
        var ctx = canvas.getContext('2d');

        // add the text watermark to the existing design canvas
        var position = new paper.Point(self.paper.view.size.width * 0.0625, self.paper.view.size.height * 0.25);
        var size = new paper.Size(self.paper.view.size.width * 0.875, self.paper.view.size.width * 0.275);
        var r = new paper.Rectangle(position, size);

        //
        // insert the text into paper, force it to fit, then update the drawing.
        //
        var text = new paper.PointText({
            point: [0, 0],
            content: "WHALE",
            fontSize: 50,
            opacity: 0.35,
            justification: "center"
        });

        text.fitBounds(r);

        paper.view.draw();

        //
        // fill in the background color
        //
        var backgroundColor = 'white';
        if(backgroundColor) {
            //get the current ImageData for the canvas.
            //data = ctx.getImageData(0, 0, w, h); // there is none

            //store the current globalCompositeOperation
            //var compositeOperation = ctx.globalCompositeOperation; // doesn't matter

            //set to draw on top of current content
            ctx.globalCompositeOperation = "source-over";

            //set background color
            ctx.fillStyle = backgroundColor;

            //draw background rectangle on entire canvas
            ctx.fillRect(0, 0, canvas.width, canvas.height);
        }


        //
        // copy the paper canvas on top of the background in the image canvas
        //
        
        //var source = document.getElementById(self.paper.project.view.element.id);

        ctx.drawImage(this.eCanvas, 0, 0, canvas.width, canvas.height);

        //
        // restore the canvas to the original state (not needed for this
        // dynamic canvas)
        //
        /*
        if(backgroundColor) {
            //clear the canvas
            ctx.clearRect (0,0,w,h);

            //restore it with original / cached ImageData
            ctx.putImageData(data, 0, 0);        

            //reset the globalCompositeOperation to what it was
            ctx.globalCompositeOperation = compositeOperation;
        }
        // */

        // get rid of the watermark now
        text.remove();

        // return a canvas that hasn't been inserted into the DOM
        return canvas;
    }

    return f;
})(Framework);

//
//
//
Framework = (function(f) {
    f.prototype.changeOrientation = function() {
        if (this.orientation != 'portrait' && this.orientation != 'landscape') {
            throw "Illegal orientation: " + this.orientation;
        }
        this.orientation = this.orientation == 'portrait' ? 'landscape' : 'portrait';
        this.design.setOrientation(this.orientation);
        //
        // resize the display elements
        //
        this.resizeDisplayElements();

        //
        // redraw the design with this new orientation
        //
        this.design.updateDesign();
        paper.view.draw();

    }

    f.prototype.getOrientation = function() {
        return this.orientation;
    }
    return f;
})(Framework);


//
// setInterface turns the mouse interface on or off.
//
Framework = (function(f) {
    f.prototype.setInterface = function(onOrOff) {
        if (onOrOff != 'on' && onOrOff != 'off') {
            throw "Illegal value '" + onOfOff + "' in setInterface";
        }
        this.interfaceActive = onOrOff == 'on';
    }
    return f;
})(Framework);

//
// the Design creation function. This requires that a Design function exists
// that will return a new design object implementing the required WHALE
// design framework API.
//
Framework = (function(f) {
    f.prototype.createDesign = function(f) {
        return new Design(f)
    }
    return f;
})(Framework);


//
// class method requires no instance
//
// TODO: needs to come from file or nodejs process
Framework = (function(f) {
    var version = '3.0.0';
    f.getVersion = function() {
        return version;
    }
    return f;
})(Framework);

//
// dominterface module
//
// all manipulation of DOM elements and css is isolated to this module.
// this is the  only  module that should reference anything in a design.html
// file.
// (there are some slight exceptions in framework.js for copying images to
// the snapshot)
//

//
// Help display functions
//
Framework = (function(f) {
    f.prototype.showHelp = function() {
        $("#edit-help").addClass("is-visible");
        this.helpActivated = true;
    }

    f.prototype.hideHelp = function() {
        $("#edit-help").removeClass("is-visible");
        this.helpActivated = false;
    }
    return f;
})(Framework);

//
// Mode changing logic. #ui-mode<n> is displayed if <n> is not the default
// mode (f.mode) which is help and help is handled as a special case, i.e.,
// this doesn't actually switch to mode f.mode. So modes switch from 1 to
// numberOfModes-1 (which is possibly a null set if there is only a single
// mode, like Mist).
//
Framework = (function(f) {

    // make the list of modes valid for this design
    f.prototype.setupModes = function(modes, curMode) {
        var $modeSelect = $("#mode-select");

        var $ul = $("<ul></ul>");
        for (var i = 0; i < modes.length; i++) {
            $ul.append($("<li>" + modes[i] + "</li>")
                .prop("id", "mode-id-" + i)
                .attr({"data-mode-title": modes[i]})
            );
        }
        // add the current class to the active mode
        $("li", $ul).eq(curMode).addClass("is-current");
        $modeSelect.append($ul);
    }

    // this will be called only when the modes are visible
    f.prototype.setModeWidths = function() {
        var $modeSelect = $("#mode-select");
        // get max display width of modes
        var widths = $("li", $modeSelect).map(function() {
            return $(this).outerWidth(true);
        });
        var maxWidth = Math.max.apply(null, widths.get());
        // convert PX to EM
        var maxWidth = maxWidth / parseFloat($modeSelect.css("font-size"));

        // set container, single modes, and all modes widths
        $modeSelect.css("width", maxWidth + "em");
        $("li", $modeSelect).css("width", maxWidth + "em");
        $("ul", $modeSelect).css("width", maxWidth * widths.length + "em");

    }

    f.prototype.getModeInfo = function(newMode) {
        var $modes = $("li", "#mode-select");
        var curpos = -1;
        // make an array of the mode numbers and find the "is-current" mode
        var modeNumbers = $modes.map(function(i) {
            if ($(this).hasClass("is-current")) {
                if (curpos !== -1) {
                    throw "More than one current mode"
                }
                curpos = i;
            }
            return $(this).idToModeNumber()
        }).get();

        // make sure there is a mode with the "is-current" class
        if (curpos === -1) {
            throw "Current mode not found";
        }

        // get the mode number of the current mode
        var mode = $modes.eq(curpos).idToModeNumber();

        // find the position of the new mode in the modes
        var newpos = modeNumbers.indexOf(newMode);

        if (newpos === -1) {
            throw "Can't find mode " + newMode;
        }

        return {
            modes: $modes,
            modeNumbers: modeNumbers,
            curpos: curpos,
            curmode: mode,
            newpos: newpos,
        }
    }

    // domSetMode changes the classes on the modes to enable the sliding
    // of the mode names.
    // 
    // it must be called  with mi, the return value of getModeInfo.
    //
    f.prototype.domSetMode = function(mi) {
        mi.modes.eq(mi.curpos).removeClass();
        mi.modes.eq(mi.newpos).addClass("is-current mode-index-" + mi.newpos);

        return mi
    }

    // 
    f.prototype.domSlideRightToMode = function(newMode) {
        var mi = this.getModeInfo(newMode);

        // remove any "mode-index-" class on the current mode
        mi.modes.eq(mi.curpos).removeClass();

        var origPos = mi.newpos;
        // is current the last item? if so move the first item to the end.
        if (mi.curpos === mi.modeNumbers.length-1) {
            mi.newpos = mi.modeNumbers.length-1;
            mi.modes.first().appendTo($("ul", "#mode-select"));
        }
        // add .is-current and .mode-index-N classes
        mi.modes.eq(origPos).addClass("is-current mode-index-" + mi.newpos);
    }

    // 
    f.prototype.domSlideLeftToMode = function(newMode) {
        var mi = this.getModeInfo(newMode);

        // remove any "mode-index-" class on the current mode
        mi.modes.eq(mi.curpos).removeClass();

        var origPos = mi.newpos;
        // is current the first item? if so move the last item to the front.
        if (mi.curpos === 0) {
            mi.newpos = 0;
            mi.modes.last().prependTo($("ul", "#mode-select"));
        }
        // add .is-current and .mode-index-N classes
        mi.modes.eq(origPos).addClass("is-current mode-index-" + mi.newpos);
        
    }

    return f;

})(Framework);

//
// resizing logic
//
Framework = (function(f) {
    f.prototype.enableResizing = function() {

        window.onresize = function(e) {
            //
            // resize the display elements and update the design
            //
            this.resizeDisplayElements();
            this.design.updateDesign();
            paper.view.draw();
        }.bind(this)
    }
    return f;
})(Framework);


//
// handle the clicks on various menu items.
//
Framework = (function(f) {
    var isFile = document.location.href.substring(0, 7) === 'file://';
    ///////////////////////////////////////////////
    // options available while viewing the snapshot
    ///////////////////////////////////////////////
    f.prototype.enableMenuClicks = function() {

        // $.support.touch is false if touch isn't supported so
        // we use 'click' instead of 'tap'.
        var click = ($.support && $.support.touch) ? 'tap' : 'click';

        $("#buy_poster").on(click, function(e){
            e.preventDefault();
            $('#buying_options').fadeIn(900,function(){
                // can't convert to SVG before knowing what size is needed
                //editable_drawing.resizable.toSVG();
            });
            // hacked in so this sort of works outside of the actual website
            var scrollToCanvas = {
                offset: -150,
                axis: 'y',
                easing: 'easeInOutQuad'
            };                

            $.scrollTo('#buying_options', 900, scrollToCanvas);
        }.bind(this));

        //
        // add to cart gets the size via the ID of the checkbox
        // the user checked and uses that to calculate the print
        // specifications for toSVG. toSVG also stores both the
        // SVG and a PNG image in the form.
        //
        $("#add_to_cart").on(click, function(e) {
            e.preventDefault();
            // find the size the user selected. each design.html file has
            // to have an ID for the radio buttons for selecting the size:
            // S for small, M for medium, and L for large
            var size = $("input[name=group_4]:checked", "#cart_form").attr("id");

            var croppedSize = f.dimensions[size];
            if (this.orientation != "landscape") {
                croppedSize = {w: croppedSize.h, h: croppedSize.w};
            }

            var svg = this.toSVG(croppedSize);
            var png = this.toPNG(f.PNGLongDimension);

            //
            // fill in the form's inputs, set the submit URL, then submit it
            //
            $('#svg_input').val(svg);
            $('#png_input').val(png);

            $("#cart_form").attr("action", this.submitURL);
            $("#cart_form").submit();
        }.bind(this));


        // change firsttime to false to suppress displaying the help screen
        //var firsttime = true;

        //
        // the design can be edited either by clicking on the edit item or
        // by clicking on the snapshot itself.
        //
        $('#edit-design, #static-image-outer').on(click, function(e){
            e.preventDefault();

            // make sure /edit appears when editing
            this.urlAtEdit = document.location.href;
            //console.log(this.urlAtEdit);
            var slash = this.urlAtEdit[this.urlAtEdit.length-1] == '/';
            if (!isFile && !this.urlAtEdit.match(/.+\/edit$/)){
                window.history.replaceState(
                    {edit: "active"},
                    'Edit',
                    this.urlAtEdit + (slash ? 'edit' : '/edit')
                );
            }

            //
            // handle the current size of the screen and then update the
            // drawing for it
            //
            this.resizeDisplayElements();
            this.setModeWidths();
            this.design.updateDesign();
            paper.view.update();
            this.setMode(f.mode);               // set the mode to the default
            this.setInterface('on');

            // resizeDisplayElements and view.update() increment _updateVersion
            this.setUpdateBase();


            // don't display until the view is drawn
            $("#edit-view, #static-view").toggleClass("is-visible");
            this.showBody();

            /*
            if (firsttime) {
                firsttime = false;
                this.showHelp();
                this.setInterface('off');
            }
            */

        }.bind(this));

        //
        // Handle the download request. Make a watermarked image in the
        // returned canvas. The canvas is not part of the DOM.
        //
        $('#download').on(click, function(e) {
            var canvas = this.makeWatermarkedCanvas(f.pngDimensions[this.orientation]);
            var item = e.currentTarget;

            item.href = canvas.toDataURL("image/png");
            // this is set in design.html file now.
            //item.download = "design.png";
        }.bind(this));

        ///////////////////////////////////////////
        // options available while editing a design
        ///////////////////////////////////////////

        // previous, switch, and next mode logic
        /*
        $("#prev-mode").on(click, function(e) {
            e.preventDefault();
            this.prevMode();
        }.bind(this));
        */

        //$("#next-mode, #mode-select, #mode-button").on(click, function(e) {
        $("#switch-mode").on(click, function(e) {
            e.preventDefault();
            this.nextMode();
        }.bind(this));

        //
        // get help on how to edit
        //
        $('#show-help, #close-help').on(click, function(e){
            e.preventDefault();
            if (!this.helpActivated) {
                this.showHelp();
                this.setInterface('off');
            } else {
                this.hideHelp();
                this.setInterface('on');
            }
        }.bind(this));

        //
        // reset the design to the initial state
        //
        $('#reset-design').on(click, function(e){
            e.preventDefault();
            //
            // set the mode back to the default value.
            //
            /* Let's try not resetting mode on a reset.
            this.domSetMode(f.mode);       // force this to avoid mismatch
            this.setMode(f.mode);
            this.previousMode = f.mode;
            // */
            //
            // resize the display elements. implicitly uses orientation
            //
            this.resizeDisplayElements();

            // draw the initial design and update the view.
            this.design.drawInitialDesign();
            paper.view.draw();
        }.bind(this));

        //
        // the save menu item
        //
        $('#apply-changes').on(click, function(e){
            e.preventDefault();

            //deactivate events
            this.setInterface('off');

            if (this.urlAtEdit.match(/.+\/edit$/)) {
                //console.log('exiting', this.urlAtEdit);
                this.urlAtEdit = this.urlAtEdit.slice(0, -"/edit".length);
            }
            if (!isFile) {
                window.history.replaceState({edit: 'no'}, '', this.urlAtEdit);
            }
            
            $("#edit-view, #static-view").toggleClass("is-visible");
            // now copy the editable image into the snapshot canvas
            this.copyEditableToSnapshot();

            // finally, set the mode back to the default so there
            // won't be a mode mismatch if the user edits it again
            this.setMode(f.mode);

        }.bind(this));

        //
        // the rotate menu item
        //
        $('#change-orientation').on(click, function(e){
            e.preventDefault();

            this.changeOrientation();
            paper.view.draw();

        }.bind(this));


        $(document).keydown(function(e) {
            switch(e.which) {
            case 37: // left
                this.prevMode();
                break;

            case 39: // right
                this.nextMode();
                break;
            /*
            case 38: // up
                break;

            case 40: // down
                break;
            // */
            default: return; // exit this handler for other keys
            }
            // prevent the default action (scroll/move caret)
            e.preventDefault();
        }.bind(this));

        //
        // new version of "save" function that posts to server
        //
        $('#save-to-wall, #add-to-wall').on(click, function(e){
            var button = $('#save-to-wall, #add-to-wall');
            button.prop("disabled", true);
            e.preventDefault();
            this.disableUnloadHandler();
            this.hideBody();
            // TODO: whole sequence may not be needed if redirect to wall
            //deactivate events
            /*
            this.setInterface('off');

            if (this.urlAtEdit.match(/.+\/edit$/)) {
                //console.log('exiting', this.urlAtEdit);
                this.urlAtEdit = this.urlAtEdit.slice(0, -"/edit".length);
            }
            if (!isFile) {
                window.history.replaceState({edit: 'no'}, '', this.urlAtEdit);
            }

            $("#edit-view, #static-view").toggleClass("is-visible");
            // */
            // end TODO: may not be needed
            // previous line demonstrates why toggle class is not a great
            // feature. what state was each class? Use .removeClass() and
            // .addClass() and there's not any question about what happens
            // to each element.
            //$("#edit-view").removeClass("is-visible");

            // export the canvas as SVG
            var svg = this.p.project.exportSVG({asString: true, matchShapes: true});
            var svgPrefix = '<?xml version="1.0" standalone="no"?>' +
                '<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">';

            // now get a PNG data URL.
            var png = this.toPNG(f.PNGLongDimension);
            // strip the mime info. if not found, start at beginning
            png = png.slice(png.indexOf(',') + 1);

            // construct the object for the ajax call.
            var data = {
                design: this.design.name,
                svg: svgPrefix + svg,
                png: png
            }

            // on success or failure enable the button and
            //   success: receives newpage to redirect to wall
            //   failure: needs to be some message.
            // TODO: change failure from alert?
            $.ajax({
                url: '/utility/wall-save-design/',
                type: 'post',
                dataType: 'json',              // text?
                //data: $("form#save-to-wall-form").serialize(),
                contentType: 'application/json; charset=UTF-8',
                data: JSON.stringify(data),
                success: function (data) {
                    //button.prop("disabled", false);
                    window.location.pathname = data.newpage;
                },
                error: function (jqXHR, textStatus, errorThrown) {
                    button.prop("disabled", false);
                    alert('failure:' + JSON.stringify(jqXHR))
                }
            });

            // now copy the editable image into the snapshot canvas.
            // this matters if the save-to-wall fails.
            this.copyEditableToSnapshot();

            // finally, set the mode back to the default so there
            // won't be a mode mismatch if the user edits it again
            // TODO: maybe not needed now unless an Angular approach is used
            this.setMode(f.mode);

            // OK, really finally now, remove hidden class in case the user
            // happens to use the back button.
            this.showBody();

        }.bind(this));

    }

    return f;

})(Framework);

//
// Document load/unload handlers.
//
Framework = (function(f) {

    f.prototype.enableUnloadHandler = function() {
        this.updateBase = this.p.project._updateVersion;
        var message = "If you leave your design changes will be lost";

        function unloadHandler (e) {
            if (this.p.project._updateVersion != this.updateBase) {
                e.returnValue = message;
                return message;
            }
        }

        this.unloadHandler = unloadHandler.bind(this);
        $(window).on("beforeunload", this.unloadHandler);
    }

    f.prototype.disableUnloadHandler = function() {
        $(window).off("beforeunload", this.unloadHandler);
    }

    // called after events that don't really cause updates, like resizing.
    f.prototype.setUpdateBase = function() {
        this.updateBase = this.p.project._updateVersion;
    }

    return f;
})(Framework);

//
// DOM element class manipulation.
//
Framework = (function(f) {

    f.prototype.hideBody = function() {
        $("body").addClass("is-hidden");
    }

    f.prototype.showBody = function() {
        $("body").removeClass("is-hidden");
    }

    return f;
})(Framework);

//
// Canvas and display element resizing logic
//
Framework = (function(f) {
    //
    // use the window dimensions less the edit-view div's padding less the
    // height of the controls. also need to reduce the height of
    // edit-canvas-outer by its border width so it doesn't expand
    // edit-view's height.
    //

    // save JQuery objects so they don't need to be looked up every resize
    var editControl = $("#edit-control");
    var debugArea = $("#debug-area");
    var editView = $("#edit-view");
    var editCanvasWrapper = $("#edit-canvas-wrapper");
    var editCanvas = $("#edit-canvas");
    var sImageOuter = $("#static-image-outer");
        //staticImage = $("#static-image");

    function getMaxDesignDimensions() {
        var controlsHeight = editControl.outerHeight();
        var verticalPadding = editView.outerHeight() - editView.height();
        var debugHeight = debugArea.outerHeight();
        var horizontalPadding = editView.outerWidth() - editView.width();
        var border = editCanvasWrapper.outerHeight() - editCanvasWrapper.height();

        //var fsHeight = $(window).height() - controlsHeight - verticalPadding - debugHeight;
        //var fsWidth = $(window).width() - horizontalPadding;
        var fsHeight = editCanvasWrapper.height();
        var fsWidth = editCanvasWrapper.width();

        return {w: fsWidth, h: fsHeight, border: border};
    }

    f.prototype.getNewDisplayElementSizes = function() {
        var size = getMaxDesignDimensions();
        var w = size.w;
        var h = size.h;
        var border = size.border;
        var frameW, frameH;

        //
        // find the limiting dimension for both orientations
        //
        if (this.orientation == 'landscape') {
            if (h < w/f.ratio) {
                frameW = h * f.ratio;
                frameH = h;
            } else {
                frameW = w;
                frameH = w / f.ratio;
            }   
        } else {
            if (w < h/f.ratio) {
                frameW = w;
                frameH = w * f.ratio;
            } else {
                frameW = h / f.ratio;
                frameH = h;
            }
        }
        // set frame sizes to integers. don't truncate beyond 1/1000 of a pixel.
        frameW = Math.floor(frameW + 0.001);
        frameH = Math.floor(frameH + 0.001);

        //return {w: w, h: h, frameW: frameW, frameH: frameH - border};
        return {w: w, h: h, frameW: frameW, frameH: frameH};
    }

    //
    // resize all the display elements including paper's view
    //
    f.prototype.resizeDisplayElements = function() {

        dim = this.getNewDisplayElementSizes();
        var width = dim.frameW;
        var height = dim.frameH;

        //editCanvasWrapper.css('width', width).css('height', height);
        editCanvas.css('width', width).css('height', height);
        //editView.css('width', dim.w).css('height', dim.h);

        var snapdim = this.getSnapshotDimensions();

        if (this.orientation == 'portrait') {
            editCanvasWrapper.addClass('portrait');
            sImageOuter.addClass('portrait');
            //sImageOuter.css('width', snapdim.w).css('height', snapdim.h);
            //staticImage.css('width', snapdim.w).css('height', snapdim.h);
        } else {
            editCanvasWrapper.removeClass('portrait');
            sImageOuter.removeClass('portrait');
            //sImageOuter.css('width', snapdim.w).css('height', snapdim.h);
            //staticImage.css('width', snapdim.w).css('height', snapdim.h);
       }

        // change paperJS view size to the new dimensions
        this.p.view.viewSize = new this.p.Size(width, height);

        //
        // set the snapshot canvas dimensions
        //
        this.setSnapshotSize();
    }

    //
    // special version to call when display: none in effect
    //
    f.prototype.initialResize = function() {
        // the sizes don't really matter - the canvas will be
        // constrained appropriately depending on the orientation.
        // TODO: but for some reason using the big dimensions makes the
        // text appear right for landscape mode on the initial draw
        // but not after rotate.
        //editCanvasWrapper.css("width", f.dimensions.S.w).css("height", f.dimensions.S.h);
        //editCanvasWrapper.css("width", f.pngDimensions.w).css("height", f.pngDimensions.h);
        editCanvasWrapper.css("width", f.pngDimensions[this.orientation].w).css("height", f.pngDimensions[this.orientation].h);
        this.resizeDisplayElements();
        editCanvasWrapper.css("width", "").css("height", "");
    }

    //
    // set the snapshot size after getting the dimensions
    //
    f.prototype.setSnapshotSize = function() {
        var oldSnapdim = this.snapdim;
        this.snapdim = this.getSnapshotDimensions();

        // don't set the values if they are the same as before. setting
        // the height or width of the static canvas clears it.
        if (oldSnapdim && this.snapdim.w == oldSnapdim.w && this.snapdim.h == oldSnapdim.h) {
            return;
        }
        // for now comment out setting dimensions for outer-div or canvas.
        // they should get done with CSS
        //*
        //console.log('scd:', this.sCanvas.width, this.sCanvas.height);
        //console.log('sco:', this.snapdim.w, this.snapdim.h);
        //sCanvasOuter.css('width', this.snapdim.w)
        //    .css('height', this.snapdim.h);
        //$('#static-canvas-outer').css('width', this.snapdim.w);
        //$('#static-canvas-outer').css('height', this.snapdim.h);
        //this.sCanvas.width = this.snapdim.w;
        //this.sCanvas.height = this.snapdim.h;
        // */
    }

    f.prototype.setSnapshotVisibilityOn = function() {
        //$('#static-image-outer').css('visibility', 'visible');
    }

    return f;
})(Framework);


// my jQuery plugin for getting the integer mode number

(function($) {
$.fn.idToModeNumber = function() {
    var match = /^mode-id-(\d)$/.exec(this.prop("id"));
    if (!match) {
        return null
    }
    return parseInt(match[1])
}
}(jQuery));



// jQuery plug-in to make this work for now. can extract tiny bit we need
// from http://www.foliotek.com/devblog/getting-the-width-of-a-hidden-element-with-jquery-using-width/

//Optional parameter includeMargin is used when calculating outer dimensions
/*
(function($) {
$.fn.getHiddenDimensions = function(includeMargin) {
    var $item = this,
        props = { position: 'absolute', visibility: 'hidden', display: 'block' },
        dim = { width:0, height:0, innerWidth: 0, innerHeight: 0,outerWidth: 0,outerHeight: 0 },
        $hiddenParents = $item.parents().andSelf().not(':visible'),
        includeMargin = (includeMargin == null)? false : includeMargin;

    var oldProps = [];
    $hiddenParents.each(function() {
        var old = {};

        for ( var name in props ) {
            old[ name ] = this.style[ name ];
            this.style[ name ] = props[ name ];
        }

        oldProps.push(old);
    });

    dim.width = $item.width();
    dim.outerWidth = $item.outerWidth(includeMargin);
    dim.innerWidth = $item.innerWidth();
    dim.height = $item.height();
    dim.innerHeight = $item.innerHeight();
    dim.outerHeight = $item.outerHeight(includeMargin);

    $hiddenParents.each(function(i) {
        var old = oldProps[i];
        for ( var name in props ) {
            this.style[ name ] = old[ name ];
        }
    });

    return dim;
}
}(jQuery));
// */

//
// output.js - implement the output formats for the design
//
// 2014-07-28 Bruce A. MacNaughton
// - First implementation in framework
//

var Framework = (function(f) {
    f.prototype.toSVG = function (croppedSize) {
        //
        // define the dimensions needed to output the SVG representation of
        // the poster. all dimensions are in pixels. the standard (value) is
        // shown on each line.
        //
        var trimWidth = 6;              // how much of the design to trim on each side (6)
        var cropMarkLength = 30;        // length of the crop marks (30)
        var cropMarkOffset = 20;        // space between the crop marks and the design (20)
        var cropMarkTotal = cropMarkLength + cropMarkOffset;

        var landscape = croppedSize.w > croppedSize.h;

        var uncroppedSize = {w: croppedSize.w + trimWidth * 2, h: croppedSize.h + trimWidth * 2};
        var totalSize = {w: uncroppedSize.w + cropMarkTotal * 2, h: uncroppedSize.h + cropMarkTotal * 2};
        var specs = {
            trimWidth: trimWidth,
            cropMarkLength: cropMarkLength,
            cropMarkOffset: cropMarkOffset,
            cropMarkTotal: cropMarkTotal,
            croppedSize: croppedSize,
            uncroppedSize: uncroppedSize,
            totalSize: totalSize
        }

        //
        // setup for printing - resize the design
        //
        var designSize = paper.project.view.viewSize;
        var designPosition = paper.project.view.bounds.center;
        //var landscape = specs.uncroppedSize.w > specs.uncroppedSize.h;
        var designRatio = landscape ? specs.uncroppedSize.w / designSize.width : specs.uncroppedSize.h / designSize.height;
        var designRatioX = specs.uncroppedSize.w / designSize.width;                 // scaling for the design
        var offset = new paper.Point(specs.cropMarkTotal, specs.cropMarkTotal);      // offset for design

        // increase the size of the view and implicitly the canvas to the required total size
        var printSize = new paper.Size(specs.totalSize.w, specs.totalSize.h);        // scaling for design + crop marks
        paper.project.view.viewSize = printSize;

        // scale the uncropped design to the specified size and move it to the center of the view to make room for
        // crop marks around the edges
        paper.project.activeLayer.scale(designRatio, [0, 0]);
        paper.project.activeLayer.position = paper.project.view.bounds.center;

        lines = insertCyanLines(specs);

        //
        // now make the SVG representation of the design
        //
        this.design.preprocessForSVG();

        // export SVG as a string
        var svg = paper.project.exportSVG({asString: true, matchShapes: true});

        // alternative method to create SVG as a string:
        //var svgObject = paper.project.exportSVG({matchShapes: true});
        //svgStringData = $(svgObject).html()  // will convert data of svgObject to string
        // even better way (better support across browsers including IE)
        // var s = new XMLSerializer();
        // var svgString = s.serializeToString(svgObject);

        //
        // restore to state before printing in reverse of process to scale
        //
        lines.remove();

        // do not set activeLayer position - was reason for Mist SVG being OOB.
        //paper.project.activeLayer.position = paper.project.view.bounds.center;
        paper.project.activeLayer.scale(1 / designRatio, [0, 0]);
        paper.project.view.viewSize = designSize;

        // reset if it was changed
        this.design.postprocessForSVG();
        
        // prepend doctype
        var doctypeStart = '<?xml version="1.0" standalone="no"?>' +
        '<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">';

        return doctypeStart + svg;
    }

    function insertCyanLines(specs) {
        /* the whole following block comment is code to print cyan lines where the crop marks should be
        // as well as to measure the rectangle made between the crop marks
        // to assure that the cropped design size is right.
        var inset = specs.cropMarkTotal + specs.trimWidth;

        // canvas bounds and size
        var cSize = paper.project.view.viewSize;
        //var cSize = cBounds.size;
        // design bounds and size
        var dBounds = paper.project.activeLayer.bounds;
        var dSize = dBounds.size;

        var trim = specs.trimWidth;
        var hTrim;
        var vTrim;

        if (landscape) {
            hTrim = trim;
            vTrim = trim / ratio;
        } else {
            hTrim = trim / ratio;
            vTrim = trim;
        }

        var hInset = (cSize.width - dSize.width) / 2 + hTrim;
        var vInset = (cSize.height - dSize.height) / 2 + vTrim;

        var hTop = 0;
        var hBot = cSize.height;
        var vLeft = 0;
        var vRight = cSize.width;

        var from = new paper.Point(hInset, hTop);
        var to = new paper.Point(hInset, hBot);
        var v1 = new paper.Path.Line(from, to);
        //v1.strokeColor = 'cyan';
        //console.log('v1', from, to);

        from = new paper.Point(cSize.width - hInset, hTop);
        to = new paper.Point(cSize.width - hInset, hBot);
        var v2 = new paper.Path.Line(from, to);
        //v2.strokeColor = 'cyan';
        //console.log('v2', from, to);

        from = new paper.Point(vLeft, vInset);
        to = new paper.Point(vRight, vInset);
        var h1 = new paper.Path.Line(from, to);
        //h1.strokeColor = 'cyan';
        //console.log('h1', from, to);

        from = new paper.Point(vLeft, hBot - vInset);
        to = new paper.Point(vRight, hBot - vInset);
        var h2 = new paper.Path.Line(from, to);
        //h2.strokeColor = 'cyan';
        //console.log('h1', from, to);

        lines  = new paper.Group([v1, v2, h1, h2]);
        lines.name = 'guidelines';
        lines.strokeWidth = 1;
        lines.strokeColor = 'cyan';

        var i1 = v1.getIntersections(h1)[0];
        //i2 = v1.getIntersections(h2)[0];
        //i3 = v2.getIntersections(h1)[0];
        var i4 = v2.getIntersections(h2)[0];

        r = new paper.Rectangle(i1.point, i4.point);
        console.log(r.size);
        console.log(r.size.width/r.size.height);

        return lines;
        // */

        //* one of this block comment or the previous block comment must active
        return new paper.Group()
        // */

    }

    //
    // function to create a PNG file with the specified long dimension.
    //
    f.prototype.toPNG = function(longDim) {
        var pvSize = paper.view.viewSize;
        var pngDataURL;
        var scaling = longDim / (pvSize.width > pvSize.height ? pvSize.width : pvSize.height);

        // adjust scaling in case there is more than 1 dot per pixel
        scaling = scaling / (window.devicePixelRatio || 1.0);

        // scale the view
        paper.view.viewSize.width *= scaling;
        paper.view.viewSize.height *= scaling;
        // scale all layers
        paper.project.layers.forEach(function(layer) {
            // manually change strokeWidth because paper doesn't.
            layer.strokeWidth *= scaling;
            layer.scale(scaling, [0, 0]);
        });

        // ask the design to update itself after resizing the canvas.
        // Don't add the background layer until after the design has been
        // updated so it won't see an extra layer present.
        // isn't necessary, except for strokeWidth. And that doesn't work.
        //this.design.updateDesign();
        

        // make a background layer and set it to white so the PNG doesn't
        // have a transparent background.
        var background = new paper.Layer();
        var rectangle = new paper.Path.Rectangle({
            point: [0, 0],
            size: paper.view.size,
            fillColor: 'white'
        });
        background.sendToBack();

        // now redraw the canvas and convert the canvas to a PNG data URL.
        paper.view.update();
        pngDataURL = this.eCanvas.toDataURL("image/png");

        // get rid of the white background.
        rectangle.remove();
        background.remove();

        // restore the design to the original scale
        if (scaling != 1.0) {
            // restore scale for all layers
            paper.project.layers.forEach(function(layer) {
                layer.strokeWidth /= scaling;
                layer.scale(1.0/scaling, [0, 0]);
            });
            paper.view.viewSize.width /= scaling;
            paper.view.viewSize.height /= scaling;
        }

        // and call updateDesign again after resizing back to original
        //this.design.updateDesign();
        paper.view.update();

        return pngDataURL;
        
    }

    return f;

})(Framework || {});


//
// paperevents.js - define a function that enables paper's mouse handling events
//
//
//

Framework = (function(f) {
    f.prototype.enableMouseEvents = function() {

        this.tool.onMouseDown = function(event) {
            if (this.interfaceActive) {
                this.dragged = false;               // didn't drag by default
                var draw = this.design.mouseDown(event);
                if (draw) {
                    paper.view.draw();
                }
            }
        }.bind(this);


        //tool.fixedDistance = 5;
        this.tool.onMouseDrag = function(event) {
            if (!this.interfaceActive) {
                return
            }
            this.dragged = true;
            var draw = this.design.mouseDrag(event);
            if (draw) {
                paper.view.draw();
            }
        }.bind(this);


        this.tool.onMouseUp = function(event) {
            if (this.helpActivated) {
                this.hideHelp();
                this.setInterface('on');
            } else if (this.interfaceActive && this.dragged) {
                // should this be called whether dragged or not?
                // can't drop points otherwise
                // TODO: when to call mouseUp.
                if (this.design.mouseUp(event)) {
                    paper.view.draw();
                }
            }
        }.bind(this);
    };
    return f;
})(Framework || {});


//
// modes.js
//
// Bruce A. MacNaughton 2015-04-02
//

Framework = (function(f) {

    // valid mode names
    f.prototype.validModeNames = [
        "draw",
        "shape",
        "move",
        "adjust",
        "color",
        "shade",
    ];


    // function to get and validate mode names from the design
    // used during framework/design initialization
    // returns an array of the node names in the order specified.
    f.prototype.getModes = function() {
        var designModes;

        // get the design's mode names
        designModes = this.design.getModes();
        
        // validate them
        for (var i = 0; i < designModes.length; i++) {
            var n = this.validModeNames.indexOf(designModes[i]);
            if (n < 0) {
                // allow 'mode<n>' for development purposes
                if (!designModes[i].match(/^mode\d$/))
                    throw "Invalid mode name: " + designModes[i];
            }
        }

        // clone them so we're not not using the design's copy
        return designModes.slice(0);
    }

    f.prototype.setMode = function(newMode) {
        if (newMode < 0 || newMode >= this.modeCount) {
            throw "Illegal value for .setMode: " + newMode;
        }

        // get the mode info from the DOM. This enables checking
        // to be done.
        var mi = this.getModeInfo(newMode);

        // consistency checks to make sure the design isn't out of
        // sync with the HTML state
        if (this.mode != mi.curmode) {
            throw "Mode mismatch: this " + this.mode + " mi " + mi.curmode;
        }
        if (mi.newpos === -1) {
            throw "Can't find requested mode: " + newMode;
        }

        // set the mode for the design with the index and the name
        this.design.setMode(newMode, this.modes[newMode]);
        this.previousMode = this.mode;
        this.mode = newMode;

        // finally set the classes in the HTML
        this.domSetMode(mi);

    };

    f.prototype.nextMode = function() {
        var newMode = this.mode + 1;
        if (newMode >= this.modeCount) {
            newMode = 0;
            }
        if (newMode < 0) {
            throw "Illegal value in .nextMode: " + newMode;
        }
        // the next three lines need are common
        this.design.setMode(newMode, this.modes[newMode]);
        this.previousMode = this.mode;
        this.mode = newMode;

        this.domSlideRightToMode(newMode);
        return newMode
    };

    f.prototype.prevMode = function() {
        var newMode = this.mode - 1;
        if (newMode < 0) {
            newMode = this.modeCount - 1;
        }
        if (newMode >= this.modecount) {
            throw "Illegal mode in .prevMode: " + newMode;
        }
        // the next three lines need are common
        this.design.setMode(newMode, this.modes[newMode]);
        this.previousMode = this.mode;
        this.mode = newMode;

        this.domSlideLeftToMode(newMode);
        return newMode
    }


    return f;
})(Framework);

//********************************************************
// GenericDrag
// no framework dependencies, but requires paper toolevent.
// uses $.extend from jQuery. 
//********************************************************

//
// GenericDrag instantiation
// - invoke on mouse down
// - converts y coordinates so 0 is the bottom of the screen
// - precalculates what it can so it's not done on every mouse move
//
// @param {object} toolevent - the mousedown toolevent
// @param {object} arg - config info for handling drags
//
(function(){
'use strict';

function GenericDrag(toolevent, arg) {
    this.te = toolevent;
    this.x = {};
    this.y = {};
    // remember the size so no need to reference paper
    this.x.size = paper.view.size.width;
    this.y.size = paper.view.size.height;

    // if caller doesn't provide x or y arguments default values
    if (!arg.x) {
        arg.x = {method: "none"};
        //arg.x = {name: "defaultX"};
    }
    if (!arg.y) {
        arg.y = {method: "none"};
        //arg.y = {name: "defaultY"};
    }


    // clone the toolevent with the y axis adjusted so 0 is at the bottom
    // of the view. Only downPoint is used so only clone that.
    this.ae = {
        /*
        event: this.te.event,            // undocumented original event
        point: new paper.Point(this.te.point.x, this.y.size-this.te.point.y),
        lastPoint: new paper.Point(
            this.te.lastPoint.x, this.y.size-this.te.lastPoint.y),
        // */
        downPoint: new paper.Point(
            this.te.downPoint.x, this.y.size-this.te.downPoint.y),
        /*
        middlePoint: new paper.Point(
            this.te.middlePoint.x, this.y.size-this.te.middlePoint.y),
        delta: new paper.Point(this.te.delta.x, this.y.size-this.te.delta.y),
        count: this.te.count,
        item: this.te.item
        // */
    }

    // if xy is specified then the only supported method is "adjusted"
    // and only the func argument counts
    if (arg.xy) {
        if (arg.xy.method !== 'raw' && arg.xy.method !== 'adjusted') {
            throw "GenericDrag xy-axis must be 'raw' or 'adjusted'";
        }
        if (arg.x || arg.y) {
            if (arg.x.method != "none" || arg.y.method != "none") {
                throw "Cannot specify x-axis or y-axis options with xy option";
            }
        }
        // copy whatever options there are
        this.xy = $.extend({}, arg.xy);

        return;
    }

    // keep from having to duplicate code for each axis
    var xy = ['x', 'y'];

    // apply defaults
    xy.forEach(function(axis) {
        this[axis].name = arg[axis].name
        this[axis].method = arg[axis].method || "raw";
        // defaults: circular is unbounded; all others are bounded
        this[axis].bounded =
            arg[axis].bounded === false || this[axis].method === "circular"
            ? false
            : true;
        // scale is the fraction of the screen required to achieve
        // the full range of values, e.g., the default, 1.0, means
        // that the low value is at the low border and the high
        // value is at the high border.
        this[axis].scale = arg[axis].scale || 1.0;
        this[axis].func = arg[axis].func;
        this[axis].debug = arg[axis].debug;
    }, this);

    // a place for the caller to put data if they want to
    this.data = {};

    // initial is required except for "none" and "raw" axes
    xy.forEach(function(axis) {
        if (this[axis].method !== "none" && this[axis].method !== "raw") {
            if (!$.isNumeric(arg[axis].initial)) {
                throw "GenericDrag - " + axis + " requires an initial value";
            }
            this[axis].initVal = arg[axis].initial;
        }
    }, this);

    // handle the caller-specified range appropriately. 
    xy.forEach(function(axis) {
        // raw and none ignore any range argument
        if (this[axis].method === 'raw' || this[axis].method === 'none') {
            return;
        }
        // arrays require special processing. the array-range gets moved to
        // axis.array and a new range, from 0 to array.length-1, is created.
        if (Array.isArray(arg[axis].range)) {
            this[axis].array = arg[axis].range;
            this[axis].range = new GenericDrag.Range(
                0, this[axis].array.length - 1
            );
            this[axis].bounded = true;
        } else {
            if (arg[axis].range.low >= arg[axis].range.high) {
                throw "GenericDrag invalid " + axis + " range: " + 
                    arg[axis].range.low + " to " + arg[axis].range.high;
            }
            this[axis].range = new GenericDrag.Range(
                arg[axis].range.low, arg[axis].range.high
            );
        }
        // units is the range of values that can be selected. units
        // can be fractional and less than 1.0, e.g., Range(0.05, 0.55)
        // yields units = 0.5.
        // TODO: replace high - low with range.range.
        this[axis].units = this[axis].range.high - this[axis].range.low;
    }, this);

    // get the adjusted downpoint as a fraction of the screen
    xy.forEach(function(axis) {
        this[axis].scrFrac = this.ae.downPoint[axis]/this[axis].size;
    }, this);


    // setup for each method.
    this.getXValue = this.getYValue = this.noop;
    var getMap = {x: "getXValue", y: "getYValue"};
    var validMap = {
        raw: this.raw, circular: this.circular, linear: this.linear,
        cycle: this.cycle,
        none: this.noop, relative: this.noop
    }

    // check for valid methods and set up get functions for x and y.
    // slight optimization for raw mode if the caller supplies a function
    xy.forEach(function(axis) {
        var f = validMap[this[axis].method].bind(this);
        if (!f) {
            throw "Invalid " + axis + "-axis method: " + this[axis].method;
        }
        if (this[axis].method === 'raw') {
            this[getMap[axis]] = arg[axis].func || this.raw;
        } else {
            this[getMap[axis]] =  function (e) {
                return f(axis, e);
            }
        }
    }, this);

    // do specific setup required for methods (linear only right now)
    // cycle doesn't really exist - needs to just be special-cased
    xy.forEach(function(axis) {
        var debugArgs = {};
        if (this[axis].method === 'linear' || this[axis].method === "cycle") {
            // linear uses constant units below and above the downPoint.
            // choose the  side that constrains the scale. compare the ratios
            // of units in each range to the fraction of the screen available.
            var loUnits = this[axis].initVal - this[axis].range.low;
            var hiUnits = this[axis].range.high - this[axis].initVal;
            var npoints;

            // handle low side or high side limiting the pixels per unit
            if (loUnits/this[axis].scrFrac > hiUnits/(1-this[axis].scrFrac)) {
                // the low side limits the pixels per unit
                npoints = this.ae.downPoint[axis];
                this[axis].ppu = npoints / loUnits;
                this[axis].zp = 0;
                debugArgs.lim = 'lo';
            } else {
                // the high side limits the pixels per unit
                npoints = this[axis].size - this.ae.downPoint[axis];
                this[axis].ppu = npoints / hiUnits;
                this[axis].zp = this.ae.downPoint[axis]-loUnits*this[axis].ppu;
                debugArgs.lim = 'hi';
            }
            // adjust the ppu by the scale now
            this[axis].ppu = this[axis].ppu * this[axis].scale;

            debugArgs.lo = loUnits;
            debugArgs.hi = hiUnits;
            debugArgs.ppu = this[axis].ppu;
            debugArgs.zp = this[axis].zp;
        } else if (this[axis].method === 'circular') {
            // circular uses linear scaling but wraps values, like
            // a color wheel.
            this[axis].ppu = this[axis].size/this[axis].range.range;
            this[axis].ppu = this[axis].ppu * this[axis].scale;
        }


        if (this[axis].debug) {
            this.debug(axis, debugArgs)
        }

    }, this);

    // now setup functions that can be used to get the values on drags
    // convenience function to return both values
    this.getValues = function(e) {
        return {x: this.getXValue(e), y: this.getYValue(e)}
    }

    // function to return value by name (for swapping the axes)
    // access via obj.getValue['name'](toolevent)
    if (this.x.name || this.y.name) {
        var names = {x: this.getXValue, y: this.getYValue};
        var drag = this;

        this.getValue = [];
        this.getValue.__defineGetter__(this.x.name, function() {
            return names.x.bind(drag)
        });
        this.getValue.__defineGetter__(this.y.name, function() {
            return names.y.bind(drag)
        });
    } else {
        this.getValue = function(name) {
            throw "Must define a name for at least one axis to call getValue";
        };
    }
}

GenericDrag.prototype.getXY = function(e) {
    if (this.xy.adjusted) {
        var ysize = this.y.size;
        e.point = new paper.Point(e.point.x, ysize-e.point.y);
        e.lastPoint = new paper.Point(e.lastPoint.x, ysize-e.lastPoint.y);
        e.downPoint = new paper.Point(e.downPoint.x, ysize-e.downPoint.y);
        e.middlePoint = new paper.Point(e.middlePoint.x, ysize-e.middlePoint.y);
        e.delta = new paper.Point(e.delta.x, -e.delta.y);
    }
    if (this.xy.func) {
        e = this.xy.func(e);
        }
    return e;
}

GenericDrag.prototype.raw = function(e) {
    return e;
}

GenericDrag.prototype.circular = function(axis, e) {
    // fix up y so the same code works for both axes. 
    // turns out e.point.y is not settable because paper returns a clone
    // of the point so just create adjusted event points (ae).
    var ae = {x: e.point.x, y: this.y.size - e.point.y};
    var nowFrac = ae[axis] / this[axis].size;

    // if bounded limit mouse movement to the window.
    // TODO: need to fix this for new logic
    if (this[axis].bounded) {
        nowFrac = Math.max(0.0, Math.min(1.0, nowFrac));
    }

    // get the number of units the mouse moved
    var units = (ae[axis] - this.ae.downPoint[axis]) / this[axis].ppu;
    // adjust the initial value by that number of units plus the range
    var nresult = this[axis].initVal + units + this[axis].units;
    // add the range again to make sure it's positive
    // TODO: handle way out of bounds?
    nresult = (nresult + this[axis].units) % this[axis].units;
    // now add that to our low bound
    nresult = this[axis].range.low + nresult
    // leave it nresult until a bit more testing.
    var result = nresult;
    //console.log(result);

    /* Original code here. Uncomment to check.
    // now check it against the result calculated the other way
    var units = this[axis].units;

    // get the value limit at the low (left|bottom) border
    var low = this[axis].initVal - this[axis].scrFrac * units;
    //var high = low + this[axis].units;

    var result = (low + units * nowFrac) % units + units;
    result = (result + this[axis].range.low) % this[axis].range.range;

    console.log(this[axis].initVal, result, nresult);
    // */

    // if an array find the index and get that value
    if (this[axis].array) {
        result = this[axis].array[Math.floor(result + 0.5)];
    }

    // if there is a function to transform the result call it
    var fresult = this[axis].func ? this[axis].func(result) : result;

    if (this[axis].debug) {
        this.debug(axis, {
            nf: nowFrac, lo: low, res: result, "f(r)": fresult,
        });
    }

    return fresult;
}

GenericDrag.prototype.linear = function(axis, e) {
    // fix up y so the same code works for both axes. 
    // turns out e.point.y is not settable because paper returns a clone
    // of the point so just create adjusted event points (ae).
    var ae = {x: e.point.x, y: this.y.size - e.point.y};

    // units can be fractional
    var units = (ae[axis] - this[axis].zp) / this[axis].ppu;
    var result = this[axis].range.low + units;

    if (this[axis].bounded) {
        result = Math.max(this[axis].range.low, Math.min(this[axis].range.high, result));
        if (this[axis].array) {
            result = this[axis].array[Math.floor(result + 0.5)];
        }
    }

    var fresult = this[axis].func ? this[axis].func(result) : result;

    if (this[axis].debug) {
        this.debug(axis, {
            zp: this[axis].zp,
            ppu: this[axis].ppu,
            un: units,
            oe: e.point[axis],
            ae: ae[axis],
            res: result,
            "f(r)": fresult,
        });
    }

    return fresult;
}

/*  work in progres

GenericDrag.prototype.cycle = function(axis, e) {
    // fix up y so the same code works for both axes. 
    // turns out e.point.y is not settable because paper returns a clone
    // of the point so just create adjusted event points (ae).
    var ae = {x: e.point.x, y: this.y.size - e.point.y};

    // units can be fractional
    var units = (ae[axis] - this[axis].zp) / this[axis].ppu;
    var result = this[axis].range.low + units;
    var range = this[axis].range.range;

    // if the result is higher than the max or lower than the min adjust it
    if (result > this[axis].range.high) {
        result = result % range ? range - result % range : result % range;
    } else if (result < this[axis].range.low) {
        result = result % range ? -range - result % range : result % range;
    }
    
    if (this[axis].bounded) {
        result = Math.max(this[axis].range.low, Math.min(this[axis].range.high, result));
        if (this[axis].array) {
            result = this[axis].array[Math.floor(result + 0.5)];
        }
    }

    var fresult = this[axis].func ? this[axis].func(result) : result;

    if (this[axis].debug) {
        this.debug(axis, {
            zp: this[axis].zp,
            ppu: this[axis].ppu,
            un: units,
            oe: e.point[axis],
            ae: ae[axis],
            res: result,
            "f(r)": fresult,
        });
    }

    return fresult;
}

// */

GenericDrag.prototype.noop = function(e) {
    var result = NaN;
    return result;
}

GenericDrag.prototype.debug = function(axis, args) {
    if (axis !== 'x' && axis !== 'y') {
        throw 'Invalid axis: ' + axis;
    }

    var lines = [];

    var line = [];
    line.push(axis);
    if (this[axis].name) {
        line.push(this[axis].name);
    }
    line.push(this[axis].method);
    if (this[axis].bounded) line.push('bounded');
    lines.push(line);

    // if none or raw then other items don't matter
    if (this[axis].method == "none" || this[axis].method == "raw") {
        return line.join(', ');
    }

    line = [];
    var where = this.ae.downPoint[axis].toFixed(2) + '/' + this[axis].size;
    line.push("dp: " + where);
    line.push("sf: " + this[axis].scrFrac.toFixed(2));
    line.push("iv: " + this[axis].initVal.toFixed(2));
    lines.push(line);

    line = [];
    if (this[axis].array) {line.push("array")};
    line.push("range: " + this[axis].range);
    lines.push(line);

    function show(obj) {
        if ($.isNumeric(obj)) {
            return obj.toFixed(2)
        }
        if (Array.isArray(obj)) {
            return '[' + obj.map(function(e) {
                return show(e)
            }).join(', ') + ']';
        }
        return obj.toString();
    }

    // rest of stuff but put result info on a separate line
    line = [];
    var keys = Object.keys(args);
    keys.forEach(function(e) {
        if (e === "res" || e === "f(r)") {
            return;
        }
        line.push(e + ': ' + show(args[e]));
    });
    if (line.length) lines.push(line);

    line = []
    if (args.res !== undefined) line.push("res: " + args.res.toFixed(2));
    if (args["f(r)"] !== undefined) line.push("f(r): " + show(args["f(r)"]));
    if (line.length) lines.push(line);

    var lines = lines.map(function(line) {
        return line.join(', ')
    });

    this[axis].debug(lines);
}


//************************************
// Ranges
//************************************

GenericDrag.Range = function(low, high) {
    if (typeof low === 'function') {
        Object.defineProperty(this, 'low', {get: low});
    } else {
        this.low = low;
    }
    if (typeof high === 'function') {
        Object.defineProperty(this, 'high', {get: high});
    } else {
        this.high = high;
    }
    if (typeof high === 'function' || typeof low === 'function') {
        Object.defineProperty(this, 'range', function() {
            return this.high - this.low
        });
    } else {
        this.range = high - low;
    }
}

GenericDrag.Range.prototype.valFrac = function(value) {
    return (value - this.low) / (this.high - this.low);
}

GenericDrag.Range.prototype.toString = function() {
    return ['[Range ', this.low, ':', this.high, ']'].join('');
}

return window.GenericDrag = GenericDrag;
})();

//
// add additional click function for development without a server
//
Framework = (function(f) {
    // get the old enabler
    var oldEnable = f.prototype.enableMenuClicks;

    // replace it with the new enabler which calls the old enabler
    f.prototype.enableMenuClicks = function() {
        oldEnable.call(this);

        // add a click handler to open a window with the PNG image in it
        $("#save-png").click(function(e) {
            e.preventDefault();
            open(this.toPNG(f.PNGLongDimension));
        }.bind(this));

        // add a click handler to open a tab/window with the SVG text in it
        $("#save-svg").click(function(e) {
            e.preventDefault();

	    var size = "S";
            var croppedSize = f.dimensions[size];
            //var croppedSize = {w: 464.8, h: 664};

            if (this.design.orientation != "landscape") {
                croppedSize = {w: croppedSize.h, h: croppedSize.w};
            }

            var svg = this.toSVG(croppedSize);
            //open("data:text/html;base64," + encodeURIComponent(svg));
            //open("data:text/plain," + svg);
            open("data:image/svg+xml," + svg);
	    
	    //var b64 = Base64.encode(svg);
	    //var b64 = btoa(unescape(encodeURIComponent(svg)));
	    //$("body").append($("<img src='data:image/svg+xml;base64,\n"+b64+"' alt='file.svg'/>"));
        }.bind(this));
    };

    // don't warn about unloaded modified designs.
    var oldEnableUnloadHandler =     f.prototype.enableUnloadHandler;
    f.prototype.enableUnloadHandler = function() {
        
    }
    
    return f;
})(Framework);
