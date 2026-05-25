sap.ui.define([
	"./BaseController",
	"sap/ui/model/json/JSONModel",
	"sap/ui/model/Filter",
	"sap/ui/model/FilterOperator",
	"sap/m/MessageBox",
	"sap/m/MessageToast"
], function (BaseController, JSONModel, Filter, FilterOperator, MessageBox, MessageToast) {
	"use strict";

	return BaseController.extend("zgpms.meilpower.com.controller.AshGatePassCreation", {

		onInit: function () {
			var oRouter = this.getRouter();
			oRouter.getRoute("AshGatePassCreation").attachMatched(this._onRouteMatched, this);
		},

		_onRouteMatched: function (oEvent) {
			this._initModel();
		},

		_initModel: function () {
			var oDate = new Date();
			var oData = {
				GPDate: oDate,
				SalesDocument: "",
				GatePassType: "NRGP",
				SoldToParty: "",
				CustomerName: "",
				CustomerGst: "",
				ZipCode: "",
				City: "",
				Remarks: "",
				VehicleNo: "",
				ModeOfDispatch: "ROAD",
				TransporterName: "",
				TransporterGst: "",
				DCNotes: "",
				GatePassNo: "",
				finalTotal: "0.00",
				ASHItmNav: []
			};

			var oModel = new JSONModel(oData);
			this.getView().setModel(oModel, "ash");
		},

		onNavBack: function () {
			this.getRouter().navTo("home");
		},

		onSalesDocValueHelp: function () {
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
						return {
							SalesDocument: subItem.SalesDocument || item.SalesDocument || "",
							GatePasstype: "NRGP",
							ItemNo: subItem.ItemNo || String((idx + 1) * 10).padStart(6, '0'),
							Material: subItem.Material || "",
							MaterialDescription: subItem.MaterialDesc || subItem.Arktx || subItem.Description || "",
							HSNCode: subItem.HSNCode || "84821000",
							RequestedQuantity: String(subItem.OrderQuantity || "0.000"),
							UOM: subItem.UOM || subItem.Uom || "MT",
							ItemNetPrice: "1000",
							Totalvalue: String((parseFloat(subItem.OrderQuantity || 0) * 1000).toFixed(2)),
							GatePassNo: ""
						};
					});

					return {
						saleOrder: item.SalesDocument || item.Vbeln || item.SalesOrder || "",
						vendor: item.SoldToParty || item.Customer || item.Kunnr || "",
						vendorName: item.CustomerName || item.Name1 || "",
						vendorGST: item.CustomerGST || item.CustomerGst || item.Gst || item.Stcd3 || "",
						city: item.City || "",
						postalCode: item.PostalCode || "",
						remarks: item.Remarks || item.Description || "",
						items: aItemsMapped
					};
				});

				that.getView().setModel(new JSONModel({ results: aMapped }), "sos");
				fnOpenDialog();
			};

			if (!oODataModel) {
				var aMockSO = this._getMockSaleOrders();
				this.getView().setModel(new JSONModel({ results: aMockSO }), "sos");
				fnOpenDialog();
				return;
			}

			sap.ui.core.BusyIndicator.show(0);
			oODataModel.read("/ZsaleOrdersSet", {
				filters: [new Filter("SalesDocType", FilterOperator.EQ, "ZASH")],
				urlParameters: { "$expand": "SaleodrItmNav" },
				success: function (oData) {
					sap.ui.core.BusyIndicator.hide();
					if (oData && oData.results && oData.results.length > 0) {
						fnProcessResults(oData.results);
					} else {
						var aMockSO = that._getMockSaleOrders();
						that.getView().setModel(new JSONModel({ results: aMockSO }), "sos");
						fnOpenDialog();
					}
				},
				error: function (oError) {
					sap.ui.core.BusyIndicator.hide();
					MessageToast.show("Error loading Sale Orders. Using mock fallback.");
					var aMockSO = that._getMockSaleOrders();
					that.getView().setModel(new JSONModel({ results: aMockSO }), "sos");
					fnOpenDialog();
				}
			});
		},

		onSaleOrderValueHelpSearch: function (oEvent) {
			var sValue = oEvent.getParameter("value");
			var oFilter = new Filter({
				filters: [
					new Filter("saleOrder", FilterOperator.Contains, sValue),
					new Filter("vendorName", FilterOperator.Contains, sValue),
					new Filter("remarks", FilterOperator.Contains, sValue)
				],
				and: false
			});
			oEvent.getSource().getBinding("items").filter([oFilter]);
		},

		onSaleOrderValueHelpConfirm: function (oEvent) {
			var oSelectedItem = oEvent.getParameter("selectedItem");
			if (!oSelectedItem) {
				return;
			}

			var oSelectedSO = oSelectedItem.getBindingContext("sos").getObject();
			this._fillFromSaleOrder(oSelectedSO);
		},

		onSaleOrderValueHelpCancel: function () {},

		onSalesDocChange: function (oEvent) {
			var sValue = oEvent.getParameter("value");
			if (!sValue) {
				this._clearForm();
				return;
			}

			var oSosModel = this.getView().getModel("sos");
			var aSaleOrders = oSosModel ? oSosModel.getProperty("/results") : this._getMockSaleOrders();

			var oSelectedSO = aSaleOrders.find(function (so) {
				return so.saleOrder === sValue;
			});

			if (oSelectedSO) {
				this._fillFromSaleOrder(oSelectedSO);
			} else {
				// Query single SO from OData
				var oODataModel = this.getOwnerComponent().getModel();
				var that = this;
				if (oODataModel) {
					sap.ui.core.BusyIndicator.show(0);
					oODataModel.read("/ZsaleOrdersSet", {
						filters: [
							new Filter("SalesDocType", FilterOperator.EQ, "ZASH"),
							new Filter("SalesDocument", FilterOperator.EQ, sValue)
						],
						urlParameters: { "$expand": "SaleodrItmNav" },
						success: function (oData) {
							sap.ui.core.BusyIndicator.hide();
							var oItem = oData && oData.results && oData.results[0];
							if (oItem) {
								var aItemsRaw = [];
								if (oItem.SaleodrItmNav) {
									if (Array.isArray(oItem.SaleodrItmNav)) {
										aItemsRaw = oItem.SaleodrItmNav;
									} else if (oItem.SaleodrItmNav.results && Array.isArray(oItem.SaleodrItmNav.results)) {
										aItemsRaw = oItem.SaleodrItmNav.results;
									}
								}
								var aItemsMapped = aItemsRaw.map(function (subItem, idx) {
									return {
										SalesDocument: subItem.SalesDocument || oItem.SalesDocument || "",
										GatePasstype: "NRGP",
										ItemNo: subItem.ItemNo || String((idx + 1) * 10).padStart(6, '0'),
										Material: subItem.Material || "",
										MaterialDescription: subItem.MaterialDesc || subItem.Arktx || subItem.Description || "",
										HSNCode: subItem.HSNCode || "84821000",
										RequestedQuantity: String(subItem.OrderQuantity || "0.000"),
										UOM: subItem.UOM || subItem.Uom || "MT",
										ItemNetPrice: "1000",
										Totalvalue: String((parseFloat(subItem.OrderQuantity || 0) * 1000).toFixed(2)),
										GatePassNo: ""
									};
								});

								var oMapped = {
									saleOrder: oItem.SalesDocument || "",
									vendor: oItem.SoldToParty || "",
									vendorName: oItem.CustomerName || "",
									vendorGST: oItem.CustomerGST || oItem.CustomerGst || "",
									city: oItem.City || "",
									postalCode: oItem.PostalCode || "",
									remarks: oItem.Remarks || "",
									items: aItemsMapped
								};
								that._fillFromSaleOrder(oMapped);
							} else {
								MessageToast.show("Invalid Sales Document.");
								that._clearForm();
							}
						},
						error: function () {
							sap.ui.core.BusyIndicator.hide();
							MessageToast.show("Invalid Sales Document.");
							that._clearForm();
						}
					});
				} else {
					MessageToast.show("Invalid Sales Document.");
					this._clearForm();
				}
			}
		},

		_fillFromSaleOrder: function (oSelectedSO) {
			var oModel = this.getView().getModel("ash");
			oModel.setProperty("/SalesDocument", oSelectedSO.saleOrder);
			oModel.setProperty("/SoldToParty", oSelectedSO.vendor);
			oModel.setProperty("/CustomerName", oSelectedSO.vendorName);
			oModel.setProperty("/CustomerGst", oSelectedSO.vendorGST);
			oModel.setProperty("/City", oSelectedSO.city);
			oModel.setProperty("/ZipCode", oSelectedSO.postalCode);
			oModel.setProperty("/Remarks", oSelectedSO.remarks);
			oModel.setProperty("/ASHItmNav", oSelectedSO.items);

			this.calculateTotal();
		},

		_clearForm: function () {
			var oModel = this.getView().getModel("ash");
			oModel.setProperty("/SalesDocument", "");
			oModel.setProperty("/SoldToParty", "");
			oModel.setProperty("/CustomerName", "");
			oModel.setProperty("/CustomerGst", "");
			oModel.setProperty("/City", "");
			oModel.setProperty("/ZipCode", "");
			oModel.setProperty("/Remarks", "");
			oModel.setProperty("/ASHItmNav", []);
			oModel.setProperty("/finalTotal", "0.00");
		},

		calculateTotal: function () {
			var oModel = this.getView().getModel("ash");
			var aItems = oModel.getProperty("/ASHItmNav") || [];
			
			var nTotal = 0;
			aItems.forEach(function(oItem, index) {
				var qty = parseFloat(oItem.RequestedQuantity) || 0;
				var rate = parseFloat(oItem.ItemNetPrice) || 0;
				var amount = qty * rate;
				oModel.setProperty("/ASHItmNav/" + index + "/Totalvalue", amount.toFixed(2));
				nTotal += amount;
			});
			
			oModel.setProperty("/finalTotal", nTotal.toFixed(2));
		},

		onSubmit: function () {
			var oModel = this.getView().getModel("ash");
			var oData = oModel.getData();
			var oODataModel = this.getOwnerComponent().getModel();
			var that = this;
			
			// Validation
			if (!oData.SalesDocument) { MessageBox.error("Please select a Sales Document."); return; }
			if (!oData.VehicleNo) { MessageBox.error("Please enter Vehicle No."); return; }
			if (!oData.ASHItmNav || oData.ASHItmNav.length === 0) {
				MessageBox.error("No items loaded for this Sales Document."); return;
			}

			var hasQtyError = oData.ASHItmNav.some(function(item) {
				return !item.RequestedQuantity || parseFloat(item.RequestedQuantity) <= 0;
			});
			if (hasQtyError) {
				MessageBox.error("Please enter a valid Quantity for all items."); return;
			}

			var hasRateError = oData.ASHItmNav.some(function(item) {
				return !item.ItemNetPrice || parseFloat(item.ItemNetPrice) <= 0;
			});
			if (hasRateError) {
				MessageBox.error("Please enter a valid Rate for all items."); return;
			}

			var oPayload = {
				GatePassType: "NRGP",
				SalesDocument: oData.SalesDocument,
				GPDate: this._formatDateToYYYYMMDD(oData.GPDate),
				SoldToParty: oData.SoldToParty,
				CustomerName: oData.CustomerName,
				CustomerGst: oData.CustomerGst,
				ZipCode: oData.ZipCode,
				City: oData.City,
				Remarks: oData.Remarks,
				VehicleNo: oData.VehicleNo,
				ModeOfDispatch: oData.ModeOfDispatch,
				TransporterName: oData.TransporterName,
				TransporterGst: oData.TransporterGst,
				DCNotes: oData.DCNotes,
				GatePassNo: "",
				ASHItmNav: oData.ASHItmNav.map(function(item) {
					return {
						SalesDocument: item.SalesDocument || oData.SalesDocument,
						GatePasstype: "NRGP",
						ItemNo: item.ItemNo,
						Material: item.Material,
						MaterialDescription: item.MaterialDescription,
						HSNCode: item.HSNCode,
						RequestedQuantity: String(parseFloat(item.RequestedQuantity).toFixed(3)),
						UOM: item.UOM,
						ItemNetPrice: String(parseFloat(item.ItemNetPrice).toFixed(2)),
						Totalvalue: String(parseFloat(item.Totalvalue).toFixed(2)),
						GatePassNo: ""
					};
				})
			};

			var fnMockSuccess = function() {
				var sGPNo = "GP-ASH-" + Math.floor(Math.random() * 90000 + 10000);
				oPayload.GatePassNo = sGPNo;

				// Save to mock local storage for fallback listing
				var aMockList = JSON.parse(localStorage.getItem("mockAshList") || "[]");
				aMockList.push(oPayload);
				localStorage.setItem("mockAshList", JSON.stringify(aMockList));

				MessageBox.success("Gate Pass " + sGPNo + " generated successfully.", {
					onClose: function () {
						that.getRouter().navTo("AshGatePassList");
					}
				});
			};

			if (oODataModel) {
				sap.ui.core.BusyIndicator.show(0);
				oODataModel.create("/AshHdrSet", oPayload, {
					success: function (oResponse) {
						sap.ui.core.BusyIndicator.hide();
						var sGPNo = oResponse.GatePassNo || "";
						var sMsg = oResponse.Message || "Gate Pass created successfully.";
						var sDisplayMsg = sMsg;
						if (sGPNo && sMsg.indexOf(sGPNo) === -1) {
							sDisplayMsg += "\nGate Pass Number: " + sGPNo;
						}
						MessageBox.success(sDisplayMsg, {
							onClose: function () {
								that.getRouter().navTo("AshGatePassList");
							}
						});
					},
					error: function (oError) {
						sap.ui.core.BusyIndicator.hide();
						var sErrMsg = "Failed to create Ash Gate Pass.";
						try {
							var oErrBody = JSON.parse(oError.responseText);
							sErrMsg = (oErrBody.error && oErrBody.error.message && oErrBody.error.message.value) ? oErrBody.error.message.value : sErrMsg;
						} catch (e) {}
						MessageBox.error(sErrMsg);
					}
				});
			} else {
				sap.ui.core.BusyIndicator.show(0);
				setTimeout(function() {
					sap.ui.core.BusyIndicator.hide();
					fnMockSuccess();
				}, 1000);
			}
		},

		_formatDateToYYYYMMDD: function (d) {
			if (!d) return "";
			var oDate = new Date(d);
			if (isNaN(oDate.getTime())) return "";
			var y = oDate.getFullYear();
			var m = String(oDate.getMonth() + 1).padStart(2, "0");
			var day = String(oDate.getDate()).padStart(2, "0");
			return y + m + day;
		},

		_getMockSaleOrders: function () {
			return [
				{
					saleOrder: "310019794",
					vendor: "0010005905",
					vendorName: "ASHTECH INDIA PVT LTD.",
					vendorGST: "33AAECA4133B1ZY",
					city: "Chennai",
					postalCode: "600107",
					remarks: "",
					items: [
						{
							SalesDocument: "310019794",
							GatePasstype: "NRGP",
							ItemNo: "000010",
							Material: "000000509001010046",
							MaterialDescription: "SCRAP,MIX,MS",
							HSNCode: "84821000",
							RequestedQuantity: "10.000",
							UOM: "MT",
							ItemNetPrice: "1000",
							Totalvalue: "10000.00",
							GatePassNo: ""
						}
					]
				},
				{
					saleOrder: "310019795",
					vendor: "0010005906",
					vendorName: "RAMCO CEMENTS LTD.",
					vendorGST: "33AABCR8375L2Z2",
					city: "Ariyalur",
					postalCode: "621729",
					remarks: "Fly Ash disposal",
					items: [
						{
							SalesDocument: "310019795",
							GatePasstype: "NRGP",
							ItemNo: "000010",
							Material: "000000509001010047",
							MaterialDescription: "FLY ASH",
							HSNCode: "26219000",
							RequestedQuantity: "15.500",
							UOM: "MT",
							ItemNetPrice: "1200",
							Totalvalue: "18600.00",
							GatePassNo: ""
						}
					]
				}
			];
		}

	});
});
