
> 		onSaleOrderValueHelp: function () {
  			var oODataModel = this.getOwnerComponent().getModel();
  			var that = this;
  
  			var fnOpenDialog = function () {
  				if (!that._pSaleOrderValueHelp) {
  					that._pSaleOrderValueHelp = sap.ui.core.Fragment.load({
  						id: that.getView().getId(),
  						name: "zgpms.meilpower.com.view.fragments.SaleOrderValueHelp",
  						controller: that
  					}).then(function (oDialog) {
  						that.getView().addDependent(oDialog);
  						return oDialog;
  					});
  				}
  
  				that._pSaleOrderValueHelp.then(function (oDialog) {
  					oDialog.getBinding("items").filter([]);
  					oDialog.open();
  				});
  			};
  
  			var fnProcessResults = function (aResults) {
  				var aMapped = aResults.map(function (item) {
  					var aItemsRaw = [];
  					if (item.SaleodrItmNav) {
  						if (Array.isArray(item.SaleodrItmNav)) {
  							aItemsRaw = item.SaleodrItmNav;
  						} else if (item.SaleodrItmNav.results && Array.isArray(item.SaleodrItmNav.results)) {
  							aItemsRaw = item.SaleodrItmNav.results;
  						}
  					}
  
  					var aItemsMapped = aItemsRaw.map(function (subItem, idx) {
  						var sRawType = subItem.MaterialType || subItem.Type || subItem.Matkl || "";
  						var sType = "Metal";
  						if (sRawType) {
  							var aKeys = ["Metal", "Rubber", "Oil", "Plastic", "Copper", "Batteries", "Spent Oil(Barrel Capacity)"];
  							var sLower = sRawType.toLowerCase();
  							var sFound = aKeys.find(function(k) {
  								return k.toLowerCase() === sLower || sLower.indexOf(k.toLowerCase()) !== -1;
  							});
  							sType = sFound || "Metal";
  						}
  						
  						var sRawUom = (subItem.Uom || subItem.Vrkme || subItem.Meins || subItem.UOM || "").toUpperCase();
  						var sUom = "KG";
  						if (sRawUom.indexOf("KG") !== -1 || sRawUom.indexOf("KILOGRAM") !== -1) {
  							sUom = "KG";
  						} else if (sRawUom.indexOf("LITRE") !== -1 || sRawUom.indexOf("LTR") !== -1 || sRawUom === "L" || sRawUom === 
"LIT") {
  							sUom = "L";
  						} else if (sRawUom.indexOf("TON") !== -1 || sRawUom.indexOf("TO") !== -1 || sRawUom.indexOf("MT") !== -1) {
  							sUom = "MT";
  						}
  
  						return {
  							sno: String(idx + 1),
  							type: sType,
  							description: subItem.MaterialDesc || subItem.Arktx || subItem.Description || subItem.Maktx || "",
  							quantity: (subItem.OrderQuantity || "0").toString(),
  							availQty: (subItem.OrderQuantity || "0").toString(),
  							uom: sUom
  						};
  					});
  
  					return {
  						saleOrder: item.SalesDocument || item.Vbeln || item.SalesOrder || "",
  						vehicleDetails: item.VehicleDetails || item.VehicleNo || "",
  						collectArea: item.CollectArea || item.StorageLocation || item.Lgort || "",
  						remarks: item.Remarks || item.Description || item.HeaderTxt || item.Text || "",
  						vendor: item.SoldToParty || item.Customer || item.Kunnr || item.Vendor || "",
  						vendorName: item.CustomerName || item.Name1 || item.VendorName || "",
  						vendorAddress: item.CustomerAddress || item.Address || item.Street || "",
  						vendorGST: item.CustomerGST || item.CustomerGst || item.Gst || item.Stcd3 || "",
  						city: item.City || "",
  						postalCode: item.PostalCode || "",
  						items: aItemsMapped
  					};
  				});
  
  				that.getView().setModel(new JSONModel({ results: aMapped }), "sos");
  				fnOpenDialog();
  			};
  
  			if (!oODataModel) {
  				MessageBox.error("SAP system is not connected. Please contact your administrator.");
  				return;
  			}
  
  			sap.ui.core.BusyIndicator.show(0);
  			oODataModel.read("/ZsaleOrdersSet", {
  				filters: [new Filter("SalesDocType", FilterOperator.EQ, "ZAOM")],
  				urlParameters: { "$expand": "SaleodrItmNav" },
  				success: function (oData) {
  					sap.ui.core.BusyIndicator.hide();
  					if (oData && oData.results && oData.results.length > 0) {
  						fnProcessResults(oData.results);
  					} else {


