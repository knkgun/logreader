import {EventEmitter} from 'events';

export class LogProvider extends EventEmitter {
	static levels = ['Debug', 'Info', 'Warning', 'Error', 'Fatal'];

	cachedSettings = null;
	fromFile = false;
	cachedEntries = [];
	hasMore = true;
	poll = false;
	pollActive = false;

	constructor (limit = 50) {
		super();
		this.baseLimit = limit;
		this.loading = false;
		this.limit = limit;
		this.searchQuery = '';
	}

	reset () {
		this.hasMore = true;
		this.limit = this.baseLimit;
		this.cachedEntries = [];
		this.loading = false;
	}

	get entries () {
		return cachedEntries;
	}

	set query (newQuery) {
		if (newQuery !== this.searchQuery) {
			if (newQuery) {
				this.stopPolling();
			}
			this.searchQuery = newQuery;
			this.reset();
			this.load().then(async () => {
				// wait with resuming polling until we've re-loaded the list
				if (!newQuery && await this.getLive()) {
					this.startPolling();
				}
			});
		}
	}

	get query () {
		return this.searchQuery;
	}

	async load () {
		this.loading = true;
		if (this.cachedEntries.length >= this.limit || this.fromFile || !this.hasMore) {
			return;
		}
		const newData = await this.loadEntries(this.cachedEntries.length, this.limit - this.cachedEntries.length);
		if (newData.data.length === 0) {
			this.hasMore = false;
		}
		this.cachedEntries = this.cachedEntries.concat(newData.data);
		this.loading = false;
		this.emit('entries', this.cachedEntries);
	}

	loadEntries (offset, count = 50) {
		return this.getSettings().then(({levels, logfile}) => {
			if (this.searchQuery) {
				return $.get(OC.generateUrl('/apps/logreader/search'), {
					offset,
					count,
					query: this.query,
					levels,
					logfile
				});
			} else {
				return $.get(OC.generateUrl('/apps/logreader/get'), {
					offset,
					count,
					levels,
					logfile
				});
			}
		});
	}

	async getSettings () {
		if (this.cachedSettings) {
			return this.cachedSettings;
		}
		this.cachedSettings = await $.get(OC.generateUrl('/apps/logreader/settings'));
		return this.cachedSettings;
	}

	async getLevels () {
		const {levels} = await this.getSettings();
		return levels.split('').map(level => level > 0);
	}

	setLevels (levels) {
		const levelsString = levels.map(level => level ? 1 : 0).join('');
		if (this.cachedSettings) {
			this.cachedSettings.levels = levelsString;
		}
		return $.ajax({
			type: 'PUT',
			url: OC.generateUrl('/apps/logreader/levels'),
			data: {levels: levelsString}
		});
	}

	async getRelative () {
		const {relativedates} = await this.getSettings();
		return relativedates;
	}

	async getDateFormat () {
		const {dateformat} = await this.getSettings();
		return dateformat;
	}

	async getLive () {
		const {live} = await this.getSettings();
		return live;
	}

	async getAvailableLogFiles () {
		const {availableLogFiles} = await this.getSettings();
		return availableLogFiles;
	}

	async getLogFile() {
		const {logfile} = await this.getSettings();
		return logfile;
	}

	setRelative (relative) {
		return $.ajax({
			type: 'PUT',
			url: OC.generateUrl('/apps/logreader/relative'),
			data: {relative}
		});
	}

	setLive (live) {
		return $.ajax({
			type: 'PUT',
			url: OC.generateUrl('/apps/logreader/live'),
			data: {live}
		});
	}

	setLogFile (logFile) {
		if (this.cachedSettings) {
			this.cachedSettings.logfile = logFile;
		}
		return $.ajax({
			type: 'PUT',
			url: OC.generateUrl('/apps/logreader/logFile'),
			data: {logFile}
		});
	}

	async startPolling () {
		if (this.cachedEntries.length === 0 || this.poll || this.pollActive) {
			return;
		}

		this.pollActive = true;
		this.poll = true;

		const { levels, logfile } = await this.getSettings();
		while (this.poll) {
			const lastReqId = this.cachedEntries[0].reqId;

			const newData = await $.get(OC.generateUrl('/apps/logreader/poll'), {
				lastReqId,
				levels,
				logfile
			});
			if (this.poll) {
				this.cachedEntries = newData.concat(this.cachedEntries);
				this.emit('entries', this.cachedEntries);
			}
		}

		this.pollActive = false;
	}

	stopPolling () {
		this.poll = false;
	}
}
