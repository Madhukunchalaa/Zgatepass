sap.ui.define([
	"./BaseController",
	"sap/ui/model/json/JSONModel",
	"sap/m/MessageBox",
	"sap/m/MessageToast",
	"sap/ui/model/Filter",
	"sap/ui/model/FilterOperator"
], function (BaseController, JSONModel, MessageBox, MessageToast, Filter, FilterOperator) {
	"use strict";

	return BaseController.extend("zgpms.meilpower.com.controller.ScrapInventory", {

		onInit: function () {
			var oRouter = this.getRouter();
			oRouter.getRoute("ScrapInventory").attachMatched(this._onRouteMatched, this);
		},

		_onRouteMatched: function () {
			this._loadInventory();
		},

		_loadInventory: function () {
			var oInventory = JSON.parse(localStorage.getItem("mockScrapInventory") || "{}");
			var aItems = Object.keys(oInventory).map(function (sKey, idx) {
				return {
					id: idx + 1,
					material: sKey,
					quantity: oInventory[sKey].quantity,
					uom: oInventory[sKey].uom
				};
			});
			var oModel = new JSONModel({
				items: aItems
			});
			this.getView().setModel(oModel, "scrapInv");
		},

		onNavBack: function () {
			this.getRouter().navTo("home");
		},

		onSearch: function (oEvent) {
			var sQuery = oEvent.getParameter("newValue");
			var oBinding = this.byId("scrapInventoryTable").getBinding("items");
			var aFilters = [];
			if (sQuery) {
				aFilters.push(new Filter("material", FilterOperator.Contains, sQuery));
			}
			oBinding.filter(aFilters);
		},

		onCopy: function () {
			var aItems = this.getView().getModel("scrapInv").getProperty("/items") || [];
			if (aItems.length === 0) {
				MessageToast.show("No data to copy.");
				return;
			}
			var sText = "Id\tMaterial\tQty\tUOM\n";
			aItems.forEach(function (item) {
				sText += item.id + "\t" + item.material + "\t" + item.quantity + "\t" + item.uom + "\n";
			});
			navigator.clipboard.writeText(sText).then(function () {
				MessageToast.show("Table copied to clipboard.");
			}).catch(function (err) {
				MessageBox.error("Failed to copy table.");
			});
		},

		onExportCSV: function () {
			var aItems = this.getView().getModel("scrapInv").getProperty("/items") || [];
			if (aItems.length === 0) {
				MessageToast.show("No data to export.");
				return;
			}
			var sCsv = "Id,Material,Qty,UOM\n";
			aItems.forEach(function (item) {
				sCsv += item.id + "," + item.material + "," + item.quantity + "," + item.uom + "\n";
			});
			this._downloadFile(sCsv, "scrap_inventory.csv", "text/csv");
		},

		onExportExcel: function () {
			var aItems = this.getView().getModel("scrapInv").getProperty("/items") || [];
			if (aItems.length === 0) {
				MessageToast.show("No data to export.");
				return;
			}
			var sCsv = "Id\tMaterial\tQty\tUOM\n";
			aItems.forEach(function (item) {
				sCsv += item.id + "\t" + item.material + "\t" + item.quantity + "\t" + item.uom + "\n";
			});
			this._downloadFile(sCsv, "scrap_inventory.xls", "application/vnd.ms-excel");
		},

		_downloadFile: function (sContent, sFileName, sMimeType) {
			var blob = new Blob([sContent], { type: sMimeType + ";charset=utf-8;" });
			if (navigator.msSaveBlob) { // IE 10+
				navigator.msSaveBlob(blob, sFileName);
			} else {
				var link = document.createElement("a");
				if (link.download !== undefined) {
					var url = URL.createObjectURL(blob);
					link.setAttribute("href", url);
					link.setAttribute("download", sFileName);
					link.style.visibility = 'hidden';
					document.body.appendChild(link);
					link.click();
					document.body.removeChild(link);
				}
			}
		},

		onPrint: function () {
			var aItems = this.getView().getModel("scrapInv").getProperty("/items") || [];
			if (aItems.length === 0) {
				MessageToast.show("No data to print.");
				return;
			}
			var sHtml = "<html><head><title>Print Scrap Inventory</title>";
			sHtml += "<style>table {width: 100%; border-collapse: collapse;} th, td {border: 1px solid black; padding: 8px; text-align: left;} th {background-color: #f2f2f2;}</style>";
			sHtml += "</head><body>";
			sHtml += "<h2>Scrap Entity List (Inventory)</h2>";
			sHtml += "<table><thead><tr><th>Id</th><th>Material</th><th>Qty</th><th>UOM</th></tr></thead><tbody>";
			aItems.forEach(function (item) {
				sHtml += "<tr><td>" + item.id + "</td><td>" + item.material + "</td><td>" + item.quantity + "</td><td>" + item.uom + "</td></tr>";
			});
			sHtml += "</tbody></table></body></html>";
			var win = window.open("", "_blank");
			win.document.write(sHtml);
			win.document.close();
			win.print();
		}
	});
});
