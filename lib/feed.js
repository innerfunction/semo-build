Feed.prototype.inputPath = function() {
}

function Feed( def ) {
    this.id = def.id;
    this.active = def.active;
    this.schedule = def.schedule;
    this.download = def.download;
    this.build = def.build;
}
