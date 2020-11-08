import Section from "../../section";
import IframeView from "../views/iframe";

class Views {
	container: HTMLDivElement;
	private _views: IframeView[];
	length: number;
	hidden: boolean;

	constructor(container: HTMLDivElement) {
		this.container = container;
		this._views = [];
		this.length = 0;
		this.hidden = false;
	}

	all() {
		return this._views;
	}

	first() {
		return this._views[0];
	}

	last() {
		return this._views[this._views.length - 1];
	}

	indexOf(view: IframeView) {
		return this._views.indexOf(view);
	}

	slice() {
		return this._views.slice.apply(this._views, arguments);
	}

	get(i: string | number) {
		return this._views[i];
	}

	append(view: IframeView) {
		this._views.push(view);
		if (this.container) {
			this.container.appendChild(view.element);
		}
		this.length++;
		return view;
	}

	prepend(view: IframeView) {
		this._views.unshift(view);
		if (this.container) {
			this.container.insertBefore(view.element, this.container.firstChild);
		}
		this.length++;
		return view;
	}

	insert(view: IframeView, index: number) {
		this._views.splice(index, 0, view);

		if (this.container) {
			if (index < this.container.children.length) {
				this.container.insertBefore(
					view.element,
					this.container.children[index]
				);
			} else {
				this.container.appendChild(view.element);
			}
		}

		this.length++;
		return view;
	}

	remove(view: any) {
		var index = this._views.indexOf(view);

		if (index > -1) {
			this._views.splice(index, 1);
		}

		this.destroy(view);

		this.length--;
	}

	private destroy(view: IframeView) {
		if (view.displayed) {
			view.destroy();
		}

		if (this.container) {
			this.container.removeChild(view.element);
		}
		view = null;
	}

	// Iterators

	forEach() {
		return this._views.forEach.apply(this._views, arguments);
	}

	/**
	 * Remove all views
	 */
	clear() {
		for (var i = 0; i < this.length; i++) {
			this.destroy(this._views[i]);
		}

		this._views = [];
		this.length = 0;
	}

	/**
	 * Returns the view corresponding to the given section if the view is
	 * displayed.
	 * @param section the section to look for
	 */
	find(section: Section) {
		for (var i = 0; i < this.length; i++) {
			let view = this._views[i];
			if (view.displayed && view.section.index == section.index) {
				return view;
			}
		}
	}

	displayed() {
		var displayed = [];
		var view: IframeView;
		var len = this.length;

		for (var i = 0; i < len; i++) {
			view = this._views[i];
			if (view.displayed) {
				displayed.push(view);
			}
		}
		return displayed;
	}

	show() {
		var view: IframeView;
		var len = this.length;

		for (var i = 0; i < len; i++) {
			view = this._views[i];
			if (view.displayed) {
				view.show();
			}
		}
		this.hidden = false;
	}

	hide() {
		for (var i = 0; i < this.length; i++) {
			if (this._views[i].displayed) {
				this._views[i].hide();
			}
		}
		this.hidden = true;
	}
}

export default Views;
