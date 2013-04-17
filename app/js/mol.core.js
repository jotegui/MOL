/**
 * This module provides core functions.
 */
mol.modules.core = function(mol) {

    mol.core = {};

    /**
     * Returns a layer id string given a layer {name, type, source, englishname}.
     */
    mol.core.getLayerId = function(layer) {
        var //name = $.trim(layer.name.toLowerCase()).replace(/ /g, "_").replace(/(.)/),
            name = this.encode(layer.name),
            type = this.encode(layer.type),
            source = this.encode(layer.source),
            source_type = this.encode(layer.source_type),
            dataset_id = this.encode(layer.dataset_id);

        return 'layer--{0}--{1}--{2}--{3}--{4}'.format(name, type, source, dataset_id, source_type);
    };
    mol.core.encode = function(string) {
        return (escape(string)).replace(/%/g,'percent');
    };
    mol.core.decode = function(string) {
        return (unescape(string.replace(/percent/g,'%')));
    };
    
}
