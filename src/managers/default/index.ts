import EventEmitter from "event-emitter";
import { extend, defer, windowBounds, isNumber } from "../../utils/core";
import scrollType from "../../utils/scrolltype";
import Mapping from "../../mapping";
import Queue from "../../utils/queue";
import Stage from "../helpers/stage";
import Views from "../helpers/views";
import { EVENTS } from "../../utils/constants";
import Section from "../../section";
import Layout from "../../layout";
import IframeView from "../views/iframe";

const MAX_NUM_OF_LOADED_VIEWS = 4;

class DefaultViewManager {
	views: Views;
	name: string;
	optsSettings: any;
	View: typeof IframeView; // should support more than just iframe view
	request: any;
	renditionQueue: any;
	q: Queue;
	settings: any;
	viewSettings: {
		ignoreClass: any;
		axis: any;
		flow: any;
		layout: any;
		method: any; // srcdoc, blobUrl, write
		width: number;
		height: number;
		forceEvenPages: boolean;
	};
	layout: Layout;
	rendered: boolean;
	overflow: string;
	stage: Stage;
	container: HTMLDivElement;
	_bounds: any;
	_stageSize: any;
	_onScroll: any;
	winBounds: {
		width: number;
		height: number;
		top: number;
		left: number;
		right: number;
		bottom: number;
	};
	isPaginated: boolean;
	scrollLeft: number;
	scrollTop: number;
	location: {
		index: any;
		href: any;
		pages: any[];
		totalPages: any;
		mapping: any;
	}[];
	mapping: any;
	ignore: boolean;
	scrolled: boolean;
	writingMode: any;

	constructor(options) {
		this.name = "default";
		this.optsSettings = options.settings;
		this.View = options.view;
		this.request = options.request;
		this.renditionQueue = options.queue;
		this.q = new Queue(this);

		this.settings = extend(this.settings || {}, {
			infinite: true,
			hidden: false,
			width: undefined,
			height: undefined,
			axis: undefined,
			writingMode: undefined,
			flow: "scrolled",
			ignoreClass: "",
			fullsize: undefined,
		});

		extend(this.settings, options.settings || {});

		this.viewSettings = {
			ignoreClass: this.settings.ignoreClass,
			axis: this.settings.axis,
			flow: this.settings.flow,
			layout: this.layout,
			method: this.settings.method, // srcdoc, blobUrl, write
			width: 0,
			height: 0,
			forceEvenPages: true,
		};

		this.rendered = false;
	}

	render(element, size) {
		let tag = element.tagName;

		if (
			typeof this.settings.fullsize === "undefined" &&
			tag &&
			(tag.toLowerCase() == "body" || tag.toLowerCase() == "html")
		) {
			this.settings.fullsize = true;
		}

		if (this.settings.fullsize) {
			this.settings.overflow = "visible";
			this.overflow = this.settings.overflow;
		}

		this.settings.size = size;

		this.settings.rtlScrollType = scrollType();

		// Save the stage
		this.stage = new Stage({
			width: size.width,
			height: size.height,
			overflow: this.overflow,
			hidden: this.settings.hidden,
			axis: this.settings.axis,
			fullsize: this.settings.fullsize,
			direction: this.settings.direction,
		});

		this.stage.attachTo(element);

		// Get this stage container div
		this.container = this.stage.getContainer();

		// Views array methods
		this.views = new Views(this.container);

		// Calculate Stage Size
		this._bounds = this.bounds();
		this._stageSize = this.stage.size();

		// Set the dimensions for views
		this.viewSettings.width = this._stageSize.width;
		this.viewSettings.height = this._stageSize.height;

		// Function to handle a resize event.
		// Will only attach if width and height are both fixed.
		this.stage.onResize(this.onResized.bind(this));

		this.stage.onOrientationChange(this.onOrientationChange.bind(this));

		// Add Event Listeners
		this.addEventListeners();

		// Add Layout method
		// this.applyLayoutMethod();
		if (this.layout) {
			this.updateLayout();
		}

		this.rendered = true;
	}

	addEventListeners() {
		var scroller;

		window.addEventListener(
			"unload",
			function (e) {
				this.destroy();
			}.bind(this)
		);

		if (!this.settings.fullsize) {
			scroller = this.container;
		} else {
			scroller = window;
		}

		this._onScroll = this.onScroll.bind(this);
		scroller.addEventListener("scroll", this._onScroll);
	}

	removeEventListeners() {
		var scroller;

		if (!this.settings.fullsize) {
			scroller = this.container;
		} else {
			scroller = window;
		}

		scroller.removeEventListener("scroll", this._onScroll);
		this._onScroll = undefined;
	}

	destroy() {
		clearTimeout(this.orientationTimeout);
		clearTimeout(this.resizeTimeout);
		clearTimeout(this.afterScrolled);

		this.clear();

		this.removeEventListeners();

		this.stage.destroy();

		this.rendered = false;

		/*

			clearTimeout(this.trimTimeout);
			if(this.settings.hidden) {
				this.element.removeChild(this.wrapper);
			} else {
				this.element.removeChild(this.container);
			}
		*/
	}
	orientationTimeout(orientationTimeout: any) {
		throw new Error("Method not implemented.");
	}
	resizeTimeout(resizeTimeout: any) {
		throw new Error("Method not implemented.");
	}
	afterScrolled(afterScrolled: any) {
		throw new Error("Method not implemented.");
	}

	onOrientationChange(e) {
		let { orientation } = window;

		if (this.optsSettings.resizeOnOrientationChange) {
			this.resize();
		}

		// Per ampproject:
		// In IOS 10.3, the measured size of an element is incorrect if the
		// element size depends on window size directly and the measurement
		// happens in window.resize event. Adding a timeout for correct
		// measurement. See https://github.com/ampproject/amphtml/issues/8479
		clearTimeout(this.orientationTimeout);
		this.orientationTimeout = setTimeout(
			function () {
				this.orientationTimeout = undefined;

				if (this.optsSettings.resizeOnOrientationChange) {
					this.resize();
				}

				this.emit(EVENTS.MANAGERS.ORIENTATION_CHANGE, orientation);
			}.bind(this),
			500
		);
	}

	onResized(e) {
		this.resize();
	}

	resize(width, height, epubcfi) {
		let stageSize = this.stage.size(width, height);

		// For Safari, wait for orientation to catch up
		// if the window is a square
		this.winBounds = windowBounds();
		if (
			this.orientationTimeout &&
			this.winBounds.width === this.winBounds.height
		) {
			// reset the stage size for next resize
			this._stageSize = undefined;
			return;
		}

		if (
			this._stageSize &&
			this._stageSize.width === stageSize.width &&
			this._stageSize.height === stageSize.height
		) {
			// Size is the same, no need to resize
			return;
		}

		this._stageSize = stageSize;

		this._bounds = this.bounds();

		// Clear current views
		this.clear();

		// Update for new views
		this.viewSettings.width = this._stageSize.width;
		this.viewSettings.height = this._stageSize.height;

		this.updateLayout();

		this.emit(
			EVENTS.MANAGERS.RESIZED,
			{
				width: this._stageSize.width,
				height: this._stageSize.height,
			},
			epubcfi
		);
	}
	emit(RESIZED: string, arg1: { width: any; height: any }, epubcfi?: any) {
		throw new Error("Method not implemented.");
	}

	createView(section, forceRight) {
		return new this.View(section, extend(this.viewSettings, { forceRight }));
	}

	handleNextPrePaginated(forceRight: boolean, section: Section, action) {
		let next;

		if (this.layout.name === "pre-paginated" && this.layout.divisor > 1) {
			if (forceRight || section.index === 0) {
				// First page (cover) should stand alone for pre-paginated books
				return;
			}
			next = section.next();
			if (next && !next.properties.includes("page-spread-left")) {
				return action.call(this, next);
			}
		}
	}

	/**
	 * Called by rendition when first opening a book,
	 * or when jumping to a different location in the book.
	 * @param section section to display
	 * @param target location to jump to
	 */
	display(section: Section, target?: string | number) {
		var displaying = new defer();
		var displayed = displaying.promise;

		// Check if moving to target is needed
		if (target === section.href || isNumber(target)) {
			target = undefined;
		}

		// Check to make sure the section we want isn't already shown
		var visible = this.views.find(section);

		// View is already shown, just move to correct location in view
		if (visible && section && this.layout.name !== "pre-paginated") {
			let offset = visible.offset();

			if (this.settings.direction === "ltr") {
				this.scrollTo(offset.left, offset.top, true);
			} else {
				let width = visible.width();
				this.scrollTo(offset.left + width, offset.top, true);
			}

			if (target) {
				let offset = visible.locationOf(target);
				this.moveTo(offset);
			}

			displaying.resolve();
			return displayed;
		}

		// Hide all current views
		this.clear();

		let forceRight = false;
		if (
			this.layout.name === "pre-paginated" &&
			this.layout.divisor === 2 &&
			section.properties.includes("page-spread-right")
		) {
			forceRight = true;
		}

		this.add(section, forceRight)
			.then(
				(view) => {
					// Move to correct place within the section, if needed
					if (target) {
						let offset = view.locationOf(target);
						this.moveTo(offset);
					}
				},
				(err) => {
					displaying.reject(err);
				}
			)
			.then(() => {
				return this.handleNextPrePaginated(forceRight, section, this.add);
			})

			.then(() => {
				this.views.show();

				displaying.resolve();
			})
			.then(async () => {
				await this.loadPreviousSection();
				await this.loadNextSection();
			});
		// .then(function(){
		// 	return this.hooks.display.trigger(view);
		// }.bind(this))
		// .then(function(){
		// 	this.views.show();
		// }.bind(this));
		return displayed;
	}

	afterDisplayed(view) {
		this.emit(EVENTS.MANAGERS.ADDED, view);
	}

	afterResized(view) {
		this.emit(EVENTS.MANAGERS.RESIZE, view.section);
	}

	moveTo(offset) {
		var distX = 0,
			distY = 0;

		if (!this.isPaginated) {
			distY = offset.top;
		} else {
			distX = Math.floor(offset.left / this.layout.delta) * this.layout.delta;

			if (distX + this.layout.delta > this.container.scrollWidth) {
				distX = this.container.scrollWidth - this.layout.delta;
			}
		}
		this.scrollTo(distX, distY, true);
	}

	add(section: Section, forceRight: boolean) {
		var view = this.createView(section, forceRight);

		this.views.append(view);

		// view.on(EVENTS.VIEWS.SHOWN, this.afterDisplayed.bind(this));
		view.onDisplayed = this.afterDisplayed.bind(this);
		view.onResize = this.afterResized.bind(this);

		view.on(EVENTS.VIEWS.AXIS, (axis) => {
			this.updateAxis(axis);
		});

		view.on(EVENTS.VIEWS.WRITING_MODE, (mode) => {
			this.updateWritingMode(mode);
		});

		return view.display(this.request);
	}

	append(section, forceRight) {
		var view = this.createView(section, forceRight);
		this.views.append(view);

		view.onDisplayed = this.afterDisplayed.bind(this);
		view.onResize = this.afterResized.bind(this);

		view.on(EVENTS.VIEWS.AXIS, (axis) => {
			this.updateAxis(axis);
		});

		view.on(EVENTS.VIEWS.WRITING_MODE, (mode) => {
			this.updateWritingMode(mode);
		});

		return view.display(this.request);
	}

	prepend(section: Section, forceRight) {
		var view = this.createView(section, forceRight);

		// handles the case where the initial width of the view
		// is incorrect
		view.on(EVENTS.VIEWS.RESIZED, (bounds) => {
			this.counter(bounds);
		});

		this.views.prepend(view);

		view.onDisplayed = this.afterDisplayed.bind(this);
		view.onResize = this.afterResized.bind(this);

		view.on(EVENTS.VIEWS.AXIS, (axis) => {
			this.updateAxis(axis);
		});

		view.on(EVENTS.VIEWS.WRITING_MODE, (mode) => {
			this.updateWritingMode(mode);
		});

		return view.display(this.request);
	}

	/**
	 * Seems to be a dirty fix.
	 * When prepending a view, we want to scroll to the end of it.
	 * When the width of the view is first calculated, it can be one page
	 * too short. By attaching an event listener that watches for a resize
	 * (listener added in prepend()), that calls this method, we can shift
	 * to the next page.
	 * @param bounds
	 */
	counter(bounds) {
		if (this.settings.axis === "vertical") {
			this.scrollTo(0, this.container.scrollTop + bounds.heightDelta, true);
		} else {
			// TODO: careful because fullscreen doesn't use container
			this.scrollTo(this.container.scrollLeft + bounds.widthDelta, 0, true);
		}
	}

	// resizeView(view) {
	//
	// 	if(this.settings.globalLayoutProperties.layout === "pre-paginated") {
	// 		view.lock("both", this.bounds.width, this.bounds.height);
	// 	} else {
	// 		view.lock("width", this.bounds.width, this.bounds.height);
	// 	}
	//
	// };

	async next() {
		let dir = this.settings.direction;

		if (!this.views.length) return;

		if (
			this.isPaginated &&
			this.settings.axis === "horizontal" &&
			(!dir || dir === "ltr")
		) {
			// default for english books
			this.scrollLeft = this.container.scrollLeft;

			// // i'm sure there is a more elegant way to do this
			// let scrollTask = this.scrollBy(this.layout.delta, 0, true);
			// // preload a page ahead
			// let loadTask: Promise<void>;
			// if (left + this.layout.delta > this.container.scrollWidth) {
			// 	loadTask = this.loadNextSection();
			// }
			// return Promise.allSettled([scrollTask, loadTask]);
			let nextLeft =
				this.container.scrollLeft +
				this.container.offsetWidth +
				this.layout.delta;
			if (nextLeft > this.container.scrollWidth) {
				await this.loadNextSection();
			}
			nextLeft =
				this.container.scrollLeft +
				this.container.offsetWidth +
				this.layout.delta;
			if (nextLeft <= this.container.scrollWidth) {
				await this.scrollBy(this.layout.delta, 0, true);
			}
			nextLeft =
				this.container.scrollLeft +
				this.container.offsetWidth +
				this.layout.delta;
			if (nextLeft > this.container.scrollWidth) {
				await this.loadNextSection();
			}
		} else if (
			this.isPaginated &&
			this.settings.axis === "horizontal" &&
			dir === "rtl"
		) {
			this.scrollLeft = this.container.scrollLeft;

			if (this.settings.rtlScrollType === "default") {
				let left = this.container.scrollLeft;

				if (left > 0) {
					this.scrollBy(this.layout.delta, 0, true);
				} else {
					return this.loadNextSection();
				}
			} else {
				let left = this.container.scrollLeft + this.layout.delta * -1;

				if (left > this.container.scrollWidth * -1) {
					this.scrollBy(this.layout.delta, 0, true);
				} else {
					return this.loadNextSection();
				}
			}
		} else if (this.isPaginated && this.settings.axis === "vertical") {
			this.scrollTop = this.container.scrollTop;

			let top = this.container.scrollTop + this.container.offsetHeight;

			if (top < this.container.scrollHeight) {
				this.scrollBy(0, this.layout.height, true);
			} else {
				this.loadNextSection();
			}
		} else {
			return this.loadNextSection();
		}
	}

	private async loadNextSection() {
		let nextSection = this.views.last().section.next();
		if (!nextSection) return; // nothing to load
		// preventing the clear allows use to preload
		// this.clear();

		let forceRight = false;
		if (
			this.layout.name === "pre-paginated" &&
			this.layout.divisor === 2 &&
			nextSection.properties.includes("page-spread-right")
		) {
			forceRight = true;
		}

		return this.append(nextSection, forceRight)
			.then(
				() => {
					return this.handleNextPrePaginated(
						forceRight,
						nextSection,
						this.append
					);
				},
				(err) => {
					return err;
				}
			)
			.then(() => {
				// Reset position to start for scrolled-doc vertical-rl in default mode
				if (
					!this.isPaginated &&
					this.settings.axis === "horizontal" &&
					this.settings.direction === "rtl" &&
					this.settings.rtlScrollType === "default"
				) {
					this.scrollTo(this.container.scrollWidth, 0, true);
				}
				this.views.show();
			})
			.then(async () => {
				if (this.views.length > MAX_NUM_OF_LOADED_VIEWS) {
					// console.log("do removal");
					let shift = this.views.first().elementBounds.width;
					await this.scrollTo(this.container.scrollLeft - shift, 0, true);

					this.views.first().hide();
					this.views.remove(this.views.first());
				}
				// console.log(this.views);
			});
	}

	async prev() {
		let dir = this.settings.direction;

		if (!this.views.length) return;

		if (
			this.isPaginated &&
			this.settings.axis === "horizontal" &&
			(!dir || dir === "ltr")
		) {
			this.scrollLeft = this.container.scrollLeft;

			if (this.container.scrollLeft === 0) {
				await this.loadPreviousSection();
			}
			if (this.container.scrollLeft !== 0) {
				await this.scrollBy(-this.layout.delta, 0, true);
			}
			if (this.container.scrollLeft === 0) {
				await this.loadPreviousSection();
			}
		} else if (
			this.isPaginated &&
			this.settings.axis === "horizontal" &&
			dir === "rtl"
		) {
			this.scrollLeft = this.container.scrollLeft;

			if (this.settings.rtlScrollType === "default") {
				let left = this.container.scrollLeft + this.container.offsetWidth;

				if (left < this.container.scrollWidth) {
					this.scrollBy(-this.layout.delta, 0, true);
				} else {
					return this.loadPreviousSection();
				}
			} else {
				let left = this.container.scrollLeft;

				if (left < 0) {
					this.scrollBy(-this.layout.delta, 0, true);
				} else {
					return this.loadPreviousSection();
				}
			}
		} else if (this.isPaginated && this.settings.axis === "vertical") {
			this.scrollTop = this.container.scrollTop;

			let top = this.container.scrollTop;

			if (top > 0) {
				this.scrollBy(0, -this.layout.height, true);
			} else {
				return this.loadPreviousSection();
			}
		} else {
			return this.loadPreviousSection();
		}
	}

	/**
	 * We can't perform a "previous" and a "loadPreviousSection together"
	 * because loadPreviousSection will set the container scroll at multiple
	 * points which are unpredictable (depend on the browser fitting the content).
	 *
	 * My solution is to load the previous section and next section before scrolling.
	 */
	private async loadPreviousSection() {
		// this.clear();
		let prevSection = this.views.first().section.prev();
		if (!prevSection) return; // nothing to load

		let forceRight = false;
		if (
			this.layout.name === "pre-paginated" &&
			this.layout.divisor === 2 &&
			typeof prevSection.prev() !== "object"
		) {
			forceRight = true;
		}
		return this.prepend(prevSection, forceRight)
			.then(
				function () {
					var left;
					if (this.layout.name === "pre-paginated" && this.layout.divisor > 1) {
						left = prevSection.prev();
						if (left) {
							return this.prepend(left);
						}
					}
				}.bind(this),
				(err) => {
					return err;
				}
			)
			.then(async () => {
				if (this.isPaginated && this.settings.axis === "horizontal") {
					let prependedView = this.views.first();
					if (this.settings.direction === "ltr") {
						// correct for the change
						// this.scrollTo(
						// 	this.container.scrollLeft + prependedView.elementBounds.width,
						// 	0,
						// 	true
						// );
						// then do the pretty scroll
						// this.scrollBy(-this.layout.delta, 0, true);
						// this.scrollTo(
						// 	this.container.scrollWidth - this.layout.delta,
						// 	0,
						// 	true
						// );
					} else {
						if (this.settings.rtlScrollType === "default") {
							this.scrollTo(0, 0, true);
						} else {
							this.scrollTo(
								this.container.scrollWidth * -1 + this.layout.delta,
								0,
								true
							);
						}
					}
				}
				this.views.show();
			})
			.then(() => {
				if (this.views.length > MAX_NUM_OF_LOADED_VIEWS) {
					this.views.last().hide();
					this.views.remove(this.views.last());
				}
				// console.log(this.views);
			});
	}

	current() {
		var visible = this.visible();
		if (visible.length) {
			// Current is the last visible view
			return visible[visible.length - 1];
		}
		return null;
	}

	/**
	 * Clear
	 */
	clear() {
		// this.q.clear();

		if (this.views) {
			this.views.hide();
			this.scrollTo(0, 0, true);
			this.views.clear();
		}
	}

	currentLocation() {
		if (this.isPaginated && this.settings.axis === "horizontal") {
			this.location = this.paginatedLocation();
		} else {
			this.location = this.scrolledLocation();
		}
		return this.location;
	}

	scrolledLocation() {
		let visible = this.visible();
		let container = this.container.getBoundingClientRect();
		let pageHeight =
			container.height < window.innerHeight
				? container.height
				: window.innerHeight;
		let pageWidth =
			container.width < window.innerWidth ? container.width : window.innerWidth;
		let vertical = this.settings.axis === "vertical";
		let rtl = this.settings.direction === "rtl";

		let offset = 0;
		let used = 0;

		if (this.settings.fullsize) {
			offset = vertical ? window.scrollY : window.scrollX;
		}

		let sections = visible.map((view) => {
			let { index, href } = view.section;
			let position = view.position();
			let width = view.width();
			let height = view.height();

			let startPos;
			let endPos;
			let stopPos;
			let totalPages;

			if (vertical) {
				startPos = offset + container.top - position.top + used;
				endPos = startPos + pageHeight - used;
				totalPages = this.layout.count(height, pageHeight).pages;
				stopPos = pageHeight;
			} else {
				startPos = offset + container.left - position.left + used;
				endPos = startPos + pageWidth - used;
				totalPages = this.layout.count(width, pageWidth).pages;
				stopPos = pageWidth;
			}

			let currPage = Math.ceil(startPos / stopPos);
			let pages = [];
			let endPage = Math.ceil(endPos / stopPos);

			// Reverse page counts for horizontal rtl
			if (this.settings.direction === "rtl" && !vertical) {
				let tempStartPage = currPage;
				currPage = totalPages - endPage;
				endPage = totalPages - tempStartPage;
			}

			pages = [];
			for (var i = currPage; i <= endPage; i++) {
				let pg = i + 1;
				pages.push(pg);
			}

			let mapping = this.mapping.page(
				view.contents,
				view.section.cfiBase,
				startPos,
				endPos
			);

			return {
				index,
				href,
				pages,
				totalPages,
				mapping,
			};
		});

		return sections;
	}

	paginatedLocation() {
		let visible = this.visible();
		let container = this.container.getBoundingClientRect();

		let left = 0;
		let used = 0;

		if (this.settings.fullsize) {
			left = window.scrollX;
		}

		let sections = visible.map((view) => {
			let { index, href } = view.section;
			let offset;
			let position = view.position();
			let width = view.width();

			// Find mapping
			let start;
			let end;
			let pageWidth;

			if (this.settings.direction === "rtl") {
				offset = container.right - left;
				pageWidth =
					Math.min(Math.abs(offset - position.left), this.layout.width) - used;
				end = position.width - (position.right - offset) - used;
				start = end - pageWidth;
			} else {
				offset = container.left + left;
				pageWidth = Math.min(position.right - offset, this.layout.width) - used;
				start = offset - position.left + used;
				end = start + pageWidth;
			}

			used += pageWidth;

			let mapping = this.mapping.page(
				view.contents,
				view.section.cfiBase,
				start,
				end
			);

			let totalPages = this.layout.count(width).pages;
			let startPage = Math.floor(start / this.layout.pageWidth);
			let pages = [];
			let endPage = Math.floor(end / this.layout.pageWidth);

			// start page should not be negative
			if (startPage < 0) {
				startPage = 0;
				endPage = endPage + 1;
			}

			// Reverse page counts for rtl
			if (this.settings.direction === "rtl") {
				let tempStartPage = startPage;
				startPage = totalPages - endPage;
				endPage = totalPages - tempStartPage;
			}

			for (var i = startPage + 1; i <= endPage; i++) {
				let pg = i;
				pages.push(pg);
			}

			return {
				index,
				href,
				pages,
				totalPages,
				mapping,
			};
		});

		return sections;
	}

	isVisible(view, offsetPrev, offsetNext, _container) {
		var position = view.position();
		var container = _container || this.bounds();

		if (
			this.settings.axis === "horizontal" &&
			position.right > container.left - offsetPrev &&
			position.left < container.right + offsetNext
		) {
			return true;
		} else if (
			this.settings.axis === "vertical" &&
			position.bottom > container.top - offsetPrev &&
			position.top < container.bottom + offsetNext
		) {
			return true;
		}

		return false;
	}

	visible() {
		var container = this.bounds();
		var views = this.views.displayed();
		var viewsLength = views.length;
		var visible = [];
		var isVisible;
		var view;

		for (var i = 0; i < viewsLength; i++) {
			view = views[i];
			isVisible = this.isVisible(view, 0, 0, container);

			if (isVisible === true) {
				visible.push(view);
			}
		}
		return visible;
	}

	/**
	 * Scrolls the container by x and y. Returns a promise that
	 * resolved to true once the scroll is complete and errors
	 * if it times out.
	 * @param x x offset to scroll by
	 * @param y y offset to scroll by
	 * @param silent prevent this from being handled by onScroll
	 */
	async scrollBy(x: number, y: number, silent: boolean): Promise<void> {
		// console.log("scrollBy", arguments);
		let dir = this.settings.direction === "rtl" ? -1 : 1;

		if (silent) {
			this.ignore = true;
		}

		if (!this.settings.fullsize) {
			let targetLeft = this.container.scrollLeft + x * dir;
			let targetTop = this.container.scrollTop + y * dir;

			return new Promise((resolve, reject) => {
				let handler = (_ev: any) => {
					if (
						this.container.scrollLeft === targetLeft &&
						this.container.scrollTop === targetTop
					) {
						resolve();
					}
				};
				this.container.addEventListener("scroll", handler);
				this.container.scrollBy({
					left: x * dir,
					top: y * dir,
					behavior: "smooth",
				});
				setTimeout(() => {
					this.container.removeEventListener("scroll", handler);
					reject(
						`Expected to scroll to (${targetLeft}, ${targetTop}) but ` +
							`instead scrolled to (${this.container.scrollLeft}, ` +
							`${this.container.scrollTop})`
					); // only does something if not yet resolved.
				}, 3000);
			});
		} else {
			window.scrollBy(x * dir, y * dir);
		}
		this.scrolled = true;
	}

	async scrollTo(x, y, silent) {
		// console.log("scrollTo", arguments);
		if (silent) {
			this.ignore = true;
		}

		if (!this.settings.fullsize) {
			return new Promise((resolve, reject) => {
				let handler = () => {
					if (
						this.container.scrollLeft === x &&
						this.container.scrollTop === y
					) {
						resolve();
					}
				};
				this.container.addEventListener("scroll", handler);
				// this.container.scrollLeft = x;
				// this.container.scrollTop = y;
				this.container.scrollTo(x, y);
				handler();
				setTimeout(() => {
					this.container.removeEventListener("scroll", handler);
					reject(
						`Expected to scroll to (${x}, ${y}) but ` +
							`instead scrolled to (${this.container.scrollLeft}, ` +
							`${this.container.scrollTop})`
					); // only does something if not yet resolved.
				}, 3000);
			});
		} else {
			window.scrollTo(x, y);
		}
		this.scrolled = true;
	}

	onScroll() {
		let scrollTop;
		let scrollLeft;

		if (!this.settings.fullsize) {
			scrollTop = this.container.scrollTop;
			scrollLeft = this.container.scrollLeft;
		} else {
			scrollTop = window.scrollY;
			scrollLeft = window.scrollX;
		}

		this.scrollTop = scrollTop;
		this.scrollLeft = scrollLeft;

		if (!this.ignore) {
			this.emit(EVENTS.MANAGERS.SCROLL, {
				top: scrollTop,
				left: scrollLeft,
			});

			clearTimeout(this.afterScrolled);
			this.afterScrolled = setTimeout(
				function () {
					this.emit(EVENTS.MANAGERS.SCROLLED, {
						top: this.scrollTop,
						left: this.scrollLeft,
					});
				}.bind(this),
				20
			);
		} else {
			this.ignore = false;
		}
	}

	bounds() {
		var bounds;

		bounds = this.stage.bounds();

		return bounds;
	}

	applyLayout(layout) {
		this.layout = layout;
		this.updateLayout();
		if (
			this.views &&
			this.views.length > 0 &&
			this.layout.name === "pre-paginated"
		) {
			this.display(this.views.first().section);
		}
		// this.manager.layout(this.layout.format);
	}

	updateLayout() {
		if (!this.stage) {
			return;
		}

		this._stageSize = this.stage.size();

		if (!this.isPaginated) {
			this.layout.calculate(this._stageSize.width, this._stageSize.height);
		} else {
			this.layout.calculate(
				this._stageSize.width,
				this._stageSize.height,
				this.settings.gap
			);

			// Set the look ahead offset for what is visible
			this.settings.offset = this.layout.delta / this.layout.divisor;

			// this.stage.addStyleRules("iframe", [{"margin-right" : this.layout.gap + "px"}]);
		}

		// Set the dimensions for views
		this.viewSettings.width = this.layout.width;
		this.viewSettings.height = this.layout.height;

		this.setLayout(this.layout);
	}

	setLayout(layout) {
		this.viewSettings.layout = layout;

		this.mapping = new Mapping(
			layout.props,
			this.settings.direction,
			this.settings.axis
		);

		if (this.views) {
			this.views.forEach(function (view) {
				if (view) {
					view.setLayout(layout);
				}
			});
		}
	}

	updateWritingMode(mode) {
		this.writingMode = mode;
	}

	updateAxis(axis, forceUpdate?: boolean) {
		if (!forceUpdate && axis === this.settings.axis) {
			return;
		}

		this.settings.axis = axis;

		this.stage && this.stage.axis(axis);

		this.viewSettings.axis = axis;

		if (this.mapping) {
			this.mapping = new Mapping(
				this.layout.props,
				this.settings.direction,
				this.settings.axis
			);
		}

		if (this.layout) {
			if (axis === "vertical") {
				this.layout.spread("none");
			} else {
				this.layout.spread(this.layout.settings.spread);
			}
		}
	}

	updateFlow(flow, defaultScrolledOverflow = "auto") {
		let isPaginated = flow === "paginated" || flow === "auto";

		this.isPaginated = isPaginated;

		if (
			flow === "scrolled-doc" ||
			flow === "scrolled-continuous" ||
			flow === "scrolled"
		) {
			this.updateAxis("vertical");
		} else {
			this.updateAxis("horizontal");
		}

		this.viewSettings.flow = flow;

		if (!this.settings.overflow) {
			this.overflow = isPaginated ? "hidden" : defaultScrolledOverflow;
			// this.overflow = isPaginated ? "scroll" : defaultScrolledOverflow;
		} else {
			this.overflow = this.settings.overflow;
		}

		this.stage && this.stage.overflow(this.overflow);

		this.updateLayout();
	}

	getContents() {
		var contents = [];
		if (!this.views) {
			return contents;
		}
		this.views.forEach(function (view) {
			const viewContents = view && view.contents;
			if (viewContents) {
				contents.push(viewContents);
			}
		});
		return contents;
	}

	direction(dir = "ltr") {
		this.settings.direction = dir;

		this.stage && this.stage.direction(dir);

		this.viewSettings.direction = dir;

		this.updateLayout();
	}

	isRendered() {
		return this.rendered;
	}
}

//-- Enable binding events to Manager
EventEmitter(DefaultViewManager.prototype);

export default DefaultViewManager;
