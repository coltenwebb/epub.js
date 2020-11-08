import { defer, requestAnimationFrame } from "./core";

/**
 * Queue for handling tasks one at a time
 * @class
 * @param {scope} context what this will resolve to in the tasks
 */
class Queue {
	private _q: {
		task?: Function;
		args?: [];
		deferred?: defer;
		promise: Promise<Function>;
	}[];
	context: any;
	tick: (callback: Function) => number;
	workingOnPromise: boolean;
	paused: boolean;
	deferred?: defer;

	constructor(context: any) {
		this._q = [];
		this.context = context;
		this.tick = requestAnimationFrame;
		this.workingOnPromise = false;
		this.paused = false;
	}

	/**
	 * Add an item to the queue
	 * @return {Promise}
	 */
	enqueue(_task: Function | Promise<Function>, taskArgs: []) {
		var deferred, promise;
		var queued;
		var task = [].shift.call(arguments);
		var args = arguments;

		// Handle single args without context
		// if(args && !Array.isArray(args)) {
		//   args = [args];
		// }
		if (!task) {
			throw new Error("No Task Provided");
		}

		if (typeof task === "function") {
			deferred = new defer();
			promise = deferred.promise;

			queued = {
				task: task,
				args: args,
				//"context"  : context,
				deferred: deferred,
				promise: promise,
			};
		} else {
			// Task is a promise
			queued = {
				promise: task,
			};
		}

		this._q.push(queued);

		// Wait to start queue flush
		if (this.paused === false && !this.workingOnPromise) {
			// setTimeout(this.flush.bind(this), 0);
			// this.tick.call(window, this.run.bind(this));
			this.run();
		}

		return queued.promise;
	}

	/**
	 * Run one item
	 * @return {Promise}
	 */
	dequeue() {
		var result;

		if (this._q.length && !this.paused) {
			let inwait = this._q.shift();
			let task = inwait.task;
			if (task) {
				// console.log(task)

				result = task.apply(this.context, inwait.args);

				if (result && typeof result["then"] === "function") {
					// Task is a function that returns a promise
					return result.then(
						inwait.deferred.resolve.bind(this.context),
						inwait.deferred.reject.bind(this.context)
					);
				} else {
					// Task resolves immediately
					inwait.deferred.resolve.apply(this.context, result);
					return inwait.promise;
				}
			} else if (inwait.promise) {
				// Task is a promise
				return inwait.promise;
			}
		} else {
			// if no tasks, do nothing silently
			let d = new defer();
			d.resolve();
			return d.promise;
		}
	}

	/**
	 * Run All Immediately
	 */
	dump() {
		while (this._q.length) {
			this.dequeue();
		}
	}

	/**
	 * Run all tasks sequentially, at convince
	 * @return {Promise}
	 */
	run(): Promise<any> {
		if (!this.workingOnPromise) {
			this.workingOnPromise = true;
			this.deferred = new defer();
		}

		this.tick.call(window, () => {
			if (this._q.length) {
				this.dequeue().then(
					function () {
						this.run();
					}.bind(this)
				);
			} else {
				this.deferred.resolve();
				this.workingOnPromise = false;
			}
		});

		// Unpause
		if (this.paused == true) {
			this.paused = false;
		}

		return this.deferred.promise;
	}

	// /**
	//  * Flush all, as quickly as possible
	//  * @return {Promise}
	//  */
	// flush(): Promise<any> {
	// 	if (this.running) {
	// 		return this.deferred.promise;
	// 	}

	// 	if (this._q.length) {
	// 		this.running = this.dequeue().then(
	// 			function () {
	// 				this.running = undefined;
	// 				return this.flush();
	// 			}.bind(this)
	// 		);

	// 		return this.running;
	// 	}
	// }

	/**
	 * Clear all items in wait
	 */
	clear() {
		this._q = [];
	}

	/**
	 * Get the number of tasks in the queue
	 * @return {number} tasks
	 */
	length() {
		return this._q.length;
	}

	/**
	 * Pause a running queue
	 */
	pause() {
		this.paused = true;
	}

	/**
	 * End the queue
	 */
	stop() {
		this._q = [];
		this.workingOnPromise = false;
		this.paused = true;
	}
}

// /**
//  * Create a new task from a callback
//  * @class
//  * @private
//  * @param {function} task
//  * @param {array} args
//  * @param {scope} context
//  * @return {function} task
//  */
// class Task {
// 	constructor(task, args, context) {
// 		return function () {
// 			var toApply = arguments || [];

// 			return new Promise((resolve, reject) => {
// 				var callback = function (value, err) {
// 					if (!value && err) {
// 						reject(err);
// 					} else {
// 						resolve(value);
// 					}
// 				};
// 				// Add the callback to the arguments list
// 				toApply.push(callback);

// 				// Apply all arguments to the functions
// 				task.apply(context || this, toApply);
// 			});
// 		};
// 	}
// }

export default Queue;
// export { Task };
