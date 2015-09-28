/*
 * Copyright 2014 Samsung Information Systems America, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *        http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// Author: Koushik Sen

// do not remove the following comment
// JALANGI DO NOT INSTRUMENT

/**
 * @file A template for writing a Jalangi 2 analysis
 * @author  Koushik Sen
 *
 */


// TODO: Please Set the env!
var instrumented_core_path = "/home/cwz/Eve/nodejs/instrumented/";
var debug = 1;

function ERROR(str) {
    console.log('ERROR: ' + str);
    process.exit(-1);
}

function DEBUG(str) {
    if (debug == 0)
         return;

    console.log('DEBUG: ' + str);
}

(function (sandbox) {
    /**
     * <p>
     *     This file is a template for writing a custom Jalangi 2 analysis.  Simply copy this file and rewrite the
     *     callbacks that you need to implement in your analysis.  Other callbacks should be removed from the file.
     *</p>
     *
     * <p>
     *     In the following methods (also called as callbacks) one can choose to not return anything.
     *     If all of the callbacks return nothing, we get a passive analysis where the
     *     concrete execution happens unmodified and callbacks can be used to observe the execution.
     *     One can choose to return suitable objects with specified properties in some callbacks
     *     to modify the behavior of the concrete execution.  For example, one could set the skip
     *     property of the object returned from {@link MyAnalysis#putFieldPre} to true to skip the actual putField operation.
     *     Similarly, one could set the result field of the object returned from a {@link MyAnalysis#write} callback
     *     to modify the value that is actually written to a variable. The result field of the object
     *     returned from a {@link MyAnalysis#conditional} callback can be suitably set to change the control-flow of the
     *     program execution.  In {@link MyAnalysis#functionExit} and {@link MyAnalysis#scriptExit},
     *     one can set the <tt>isBacktrack</tt> property of the returned object to true to reexecute the body of
     *     the function from the beginning.  This in conjunction with the ability to change the
     *     control-flow of a program enables us to explore the different paths of a function in
     *     symbolic execution.
     * </p>
     *
     * <p>
     *     Note that if <tt>process.exit()</tt> is called, then an execution terminates abnormally and a callback to
     *     {@link MyAnalysis#endExecution} will be skipped.
     * </p>
     *
     * <p>
     *     An analysis can access the source map, which maps instruction identifiers to source locations,
     *     using the global object stored in <code>J$.smap</code>.  Jalangi 2
     *     assigns a unique id, called <code>sid</code>, to each JavaScript
     *     script loaded at runtime.  <code>J$.smap</code> maps each <code>sid</code> to an object, say
     *     <code>iids</code>, containing source map information for the script whose id is <code>sid</code>.
     *     <code>iids</code> has the following properties: <code>"originalCodeFileName"</code> (stores the path of the original
     *     script file), <code>"instrumentedCodeFileName"</code> (stores the path of the instrumented script file),
     *     <code>"url"</code> (is optional and stores the URL of the script if it is set during instrumentation
     *     using the --url option),
     *     <code>"evalSid"</code> (stores the sid of the script in which the eval is called in case the current script comes from
     *     an <code>eval</code> function call),
     *     <code>"evalIid"</code> (iid of the <code>eval</code> function call in case the current script comes from an
     *     <code>eval</code> function call), <code>"nBranches"</code> (the number of conditional statements
     *     in the script),
     *     and <code>"code"</code> (a string denoting the original script code if the code is instrumented with the
     *     --inlineSource option).
     *     <code>iids</code> also maps each <code>iid</code> (which stands for instruction id, an unique id assigned
     *     to each callback function inserted by Jalangi2) to an array containing
     *     <code>[beginLineNumber, beginColumnNumber, endLineNumber, endColumnNumber]</code>.  The mapping from iids
     *     to arrays is only available if the code is instrumented with
     *     the --inlineIID option.
     * </p>
     * <p>
     *     In each callback described below, <code>iid</code> denotes the unique static instruction id of the callback in the script.
     *     Two callback functions inserted in two different scripts may have the same iid.  In a callback function, one can access
     *     the current script id using <code>J$.sid</code>.  One can call <code>J$.getGlobalIID(iid)</code> to get a string, called
     *     <code>giid</code>, that statically identifies the
     *     callback throughout the program.  <code>J$.getGlobalIID(iid)</code> returns the string <code>J$.sid+":"+iid</code>.
     *     <code>J$.iidToLocation(giid)</code> returns a string
     *     containing the original script file path, begin and end line numbers and column numbers of the code snippet
     *     for which the callback with <code>giid</code> was inserted.
     *
     * </p>
     * <p>
     *     A number of sample analyses can be found at {@link ../src/js/sample_analyses/}.  Refer to {@link ../README.md} for instructions
     *     on running an analysis.
     * </p>
     *
     *
     *
     * @global
     * @class
     */
    function MyAnalysis() {
        /**
         * This callback is called before a function, method, or constructor invocation.
         * Note that a method invocation also triggers a {@link MyAnalysis#getFieldPre} and a
         * {@link MyAnalysis#getField} callbacks.
         *
         * @example
         * y.f(a, b, c)
         *
         * // the above call roughly gets instrumented as follows:
         *
         * var skip = false;
         * var aret = analysis.invokeFunPre(113, f, y, [a, b, c], false, true);
         * if (aret) {
         *     f = aret.f;
         *     y = aret.y;
         *     args = aret.args;
         *     skip = aret.skip
         * }
         * if (!skip) {
         *     f.apply(y, args);
         * }
         *
         * @param {number} iid - Static unique instruction identifier of this callback
         * @param {function} f - The function object that going to be invoked
         * @param {object} base - The receiver object for the function <tt>f</tt>
         * @param {Array} args - The array of arguments passed to <tt>f</tt>
         * @param {boolean} isConstructor - True if <tt>f</tt> is invoked as a constructor
         * @param {boolean} isMethod - True if <tt>f</tt> is invoked as a method
         * @param {number} functionIid - The iid (i.e. the unique instruction identifier) passed to the callback
         * {@link MyAnalysis#functionEnter} when the function <tt>f</tt> is executed.  The <tt>functionIid</tt> can be
         * treated as the static identifier of the function <tt>f</tt>.  Note that a given function code block can
         * create several function objects, but each such object has a common <tt>functionIid</tt>, which is the iid
         * that is passed to {@link MyAnalysis#functionEnter} when the function executes.
         * @returns {{f: function, base: Object, args: Array, skip: boolean}|undefined} - If an object is returned and
         * the <tt>skip</tt> property of the object is true, then the invocation operation is skipped.
         * Original <tt>f</tt>, <tt>base</tt>, and <tt>args</tt> are replaced with that from the returned object if
         * an object is returned.
         *
         */
        this.invokeFunPre = function (iid, f, base, args, isConstructor, isMethod, functionIid) {

            // DEBUG('(' + sandbox.iidToLocation(sandbox.sid, iid) + ')');

            if (f.name == 'require') {
                // let's link to the instrumented library and see how it ends up with
                // TODO: what if a instrumented lib require another (potentially) instrumented code?

                DEBUG(f.name + '(' + JSON.stringify(args) + ')');

                if (args.length != 1) {
                    ERROR('Wrong args # for require()!');
                }

                var required = args[0];

                // TODO: add all core libraries!
                var core = [];
                core = ["buffer", "./fu"];
                if (core.indexOf(required) >= 0) {
                } else {
                    args[0] = instrumented_core_path + args[0];
                }  

                DEBUG(f.name + '(' + args[0] + ')');

            }

            return {f: f, base: base, args: args, skip: false};
        };
        this._throw = function (iid, val) {
            return {result: val};
        };
        this.functionEnter = function (iid, f, dis, args) {
            if (f.name === 'emit') {
                // DEBUG('emit> ' + args[0]);
            }
        };
        this.functionExit = function (iid, returnVal, wrappedExceptionVal) {
            // DEBUG('FExit> ');
            return {returnVal: returnVal, wrappedExceptionVal: wrappedExceptionVal, isBacktrack: false};
        };
    }

    sandbox.analysis = new MyAnalysis();
})(J$);



