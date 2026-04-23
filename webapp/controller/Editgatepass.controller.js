sap.ui.define([
	'./BaseController',
		"sap/ui/core/date/UI5Date",
	'sap/ui/model/json/JSONModel',
	"sap/ui/VersionInfo",
	"sap/ui/core/mvc/XMLView",
	"sap/ui/core/Core"
], function (BaseController,UI5Date, JSONModel, VersionInfo, XMLView, oCore) {
	
	"use strict";
	
	return BaseController.extend("zgpms.meilpower.com.controller.Editgatepass", {

		onInit: function () {
			// Sample JSON Data
            var oData = {
                materials: [
                    { matnr: "3121800221", maktx: "3121800221" },
                    { matnr: "3121800222", maktx: "3121800222" },
                    { matnr: "3121800223", maktx: "3121800223" }
                ]
            };

            // Create JSON Model
            var oModel1 = new JSONModel(oData);

            // Set Model to View
            this.getView().setModel(oModel1,"materialModel");
				var _data = {
			// current date in "yyyy-MM-dd" format
			date: UI5Date.getInstance().toISOString().slice(0, 10)
		};
			var oModel = new JSONModel(this._data);
			this.getView().setModel(oModel);	
		},
		onGPassChange: function (oEvent) {

    var oComboBox = oEvent.getSource();

    // Selected Key
    var sSelectedKey = oComboBox.getSelectedKey();

    // Selected Item Text
    var sSelectedText = oComboBox.getSelectedItem() 
        ? oComboBox.getSelectedItem().getText() 
        : "";

    console.log("Selected Key:", sSelectedKey);
    console.log("Selected Text:", sSelectedText);
	 this.byId("gatepassEditBox").setVisible(false);
	  this.byId("gatepassUpdateBox").setVisible(true);
	   this.byId("gatepassUpdateTable").setVisible(true);

},
onAdd : function(oEvent) {
var oItem = new sap.m.ColumnListItem({
cells : [ new sap.m.Input(),new sap.m.Input(),new sap.m.Input(),new sap.m.Input(),new sap.m.Input(),new sap.m.Input(),new sap.m.Input(),new sap.m.Input(), new sap.m.Input({
showValueHelp : true

}), new sap.m.Button({
text : "Delete",
press : [ this.remove, this ]
}) ]
});

var oTable = this.getView().byId('tableId');
oTable.addItem(oItem);
},
deleteRow : function(oEvent) {
var oTable = this.getView().byId('tableId');
oTable.removeItem(oEvent.getParameter('listItem'));
},

remove : function(oEvent) {
var oTable = this.getView().byId('tableId');
oTable.removeItem(oEvent.getSource().getParent());
}
	});
});